import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";

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
    const result = await plantsCollection
      .find()
      .sort({ createdAt: -1 })
      .toArray();

    res.send(result);
  } catch (error) {
    console.log(error);

    res.status(500).send({
      success: false,
      message: "Failed to fetch plants.",
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

    const query = {
      _id: new ObjectId(id),
    };

    const result = await plantsCollection.deleteOne(query);

    res.send(result);
  } catch (error) {
    console.log(error);

    res.status(500).send({
      success: false,
      message: "Failed to delete plant.",
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