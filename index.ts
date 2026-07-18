import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
import OpenAI from "openai";
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

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const db = client.db("plant_pal_db");
    const plantsCollection = db.collection("plants");
    const reviewsCollection = db.collection("reviews");
    const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

    //posting plants
    app.post("/api/plants", async (req, res) => {
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
app.get("/api/my-plants/:email", async (req, res) => {
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
app.delete("/api/plants/:id", async (req, res) => {
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

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
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

If someone asks something unrelated to plants or PlantPal,
politely answer briefly and guide the conversation back to plants.

Keep answers friendly and concise.
`,
        },
        ...messages,
      ],
    });

    res.send({
      reply:
        completion.choices[0].message.content ??
        "Sorry, I couldn't generate a response.",
    });
  } catch (error) {
    console.error(error);

    res.status(500).send({
      message: "AI failed.",
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