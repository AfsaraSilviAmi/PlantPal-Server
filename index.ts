import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
import OpenAI from "openai";
import { createRemoteJWKSet, jwtVerify } from "jose-cjs";
dotenv.config();

const app = express();

const port = 5000;


// Middleware
app.use(cors());
app.use(express.json());

// Test Route
app.get("/", (req, res) => {
  res.send("Server is running");
});


const uri = process.env.MONGO_DB_URI
if (!uri) {
  throw new Error("MONGO_DB_URI is missing in .env");
}


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`)
)

const verifyToken = async (req:Request, res:Response, next:NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);

    (req as any).decoded = payload;

    next();
  } catch (error) {
    return res.status(403).json({
      message: "Forbidden",
    });
  }
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const db = client.db("plant_pal_db");
    const plantsCollection = db.collection("plants");

    const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

    //posting plants
    app.post("/api/plants", verifyToken, async (req, res) => {
  try {
    const plant = req.body;

    plant.createdAt = new Date();

    const result = await plantsCollection.insertOne(plant);

    res.status(201).send(result);
  } catch (error) {
    console.log(error);

    res.status(500).send({
      success: false,
      message: "Failed to add plant.",
    });
  }
});

//get plants
app.get("/api/plants", async (req, res) => {
  try {
    const search = req.query.search as string;
    const category = req.query.category as string;
    const difficulty = req.query.difficulty as string;

    const query: any = {};

    if (search) {
      query.title = {
        $regex: search,
        $options: "i",
      };
    }

    if (category) {
      query.category = category;
    }

    if (difficulty) {
      query.difficulty = difficulty;
    }

    const result = await plantsCollection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to fetch plants.",
    });
  }
});
//featured plants
app.get("/api/featured-plants", async (req, res) => {
  try {
    const featuredPlants = await plantsCollection
      .find({})
      .sort({ rating: -1 })
      .limit(4)
      .toArray();

    res.send(featuredPlants);
  } catch (error) {
    console.log(error);

    res.status(500).send({
      success: false,
      message: "Failed to fetch featured plants.",
    });
  }
});
// Plant category statistics
app.get("/api/stats/categories", async (req, res) => {
  try {
    const stats = await plantsCollection
      .aggregate([
        {
          $group: {
            _id: "$category",
            total: {
              $sum: 1,
            },
          },
        },
        {
          $project: {
            _id: 0,
            category: "$_id",
            total: 1,
          },
        },
        {
          $sort: {
            total: -1,
          },
        },
      ])
      .toArray();

    res.send(stats);
  } catch (error) {
    console.log(error);

    res.status(500).send({
      success: false,
      message: "Failed to load category statistics.",
    });
  }
});
//manage plants
app.get("/api/my-plants/:email", verifyToken, async (req, res) => {
  try {
    const email = req.params.email;

    const result = await plantsCollection
      .find({ createdByEmail: email })
      .sort({ createdAt: -1 })
      .toArray();

    res.send(result);
  } catch (error) {
    console.log(error);

    res.status(500).send({
      success: false,
      message: "Failed to fetch user's plants.",
    });
  }
});
//plant details
app.get("/api/plants/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const query = {
      _id: new ObjectId(id),
    };

    const result = await plantsCollection.findOne(query);

    res.send(result);
  } catch (error) {
    console.log(error);

    res.status(500).send({
      success: false,
      message: "Plant not found.",
    });
  }
});

//delete plant
app.delete("/api/plants/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const email = req.query.email as string;

    const result = await plantsCollection.deleteOne({
      _id: new ObjectId(id),
      createdByEmail: email,
    });

    if (result.deletedCount === 0) {
      return res.status(403).send({
        success: false,
        message: "Unauthorized.",
      });
    }

    res.send(result);
  } catch (error) {
    console.log(error);

    res.status(500).send({
      success: false,
      message: "Failed to delete plant.",
    });
  }
});
app.post("/api/chat", async (req, res) => {
  try {
    const messages = Array.isArray(req.body.messages)
      ? req.body.messages
      : [];


    const stream = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",

      stream: true,

      messages: [
        {
          role: "system",
          content: `
You are PlantPal AI, an AI assistant inside the PlantPal application.

PlantPal lets users:
- Browse plants
- View plant details
- Add plants
- Manage their own plants

Answer questions about:
- Plant care
- Watering
- Sunlight
- Indoor vs outdoor plants
- Pet-friendly plants
- Beginner plants
- Navigation within PlantPal

Keep answers friendly and concise.
`,
        },

        ...messages,
      ],
    });


    res.setHeader(
      "Content-Type",
      "text/plain; charset=utf-8"
    );

    res.setHeader(
      "Transfer-Encoding",
      "chunked"
    );


    for await (const chunk of stream) {

      const content =
        chunk.choices[0]?.delta?.content || "";


      if (content) {
        res.write(content);
      }

    }


    res.end();


  } catch(error){

    console.error(error);

    res.status(500).send({
      message:"AI failed."
    });

  }
});

// AI Plant Recommendation Engine

app.post("/api/recommendations", async (req, res) => {

  try {

    const preferences = req.body;


    // 1. Get all plants from database

    const plants = await plantsCollection
      .find({})
      .toArray();



    // 2. Create AI prompt

    const prompt = `
You are PlantPal AI Recommendation Engine.

Your job is to recommend plants based on user preferences.

User Preferences:

${JSON.stringify(preferences)}


Available Plants:

${JSON.stringify(plants)}


Choose the best 4 plants.

Return ONLY valid JSON.

Format:

[
 {
   "plantId":"",
   "plantName":"",
   "match":"",
   "reason":""
 }
]

Rules:
- Recommend only plants from the database.
- Explain why each plant matches.
- Match should be percentage like 95%.
`;



    // 3. Call AI

    const completion =
      await groq.chat.completions.create({

        model:"llama-3.3-70b-versatile",

        messages:[
          {
            role:"system",
            content:prompt
          }
        ],

        temperature:0.7

      });



    const aiResponse =
  completion.choices[0].message.content ?? "";


    // remove possible markdown

    const cleaned =
      aiResponse.replace(/```json/g,"")
      .replace(/```/g,"")
      .trim();



    const recommendations =
      JSON.parse(cleaned);



    res.send(recommendations);


  }
  catch(error){

    console.log(error);


    res.status(500).send({
      message:"AI recommendation failed"
    });

  }


});
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);

// Start Server
app.listen(port, () => {
  console.log("Server is running");
});