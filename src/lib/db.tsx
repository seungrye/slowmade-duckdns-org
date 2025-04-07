import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI as string;

export const connectToDB = async () => {
  // console.log("Connecting to MongoDB... readyState:", mongoose.connection.readyState);

  if (mongoose.connection.readyState >= 1) {
    return;
  }

  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB Connected");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
  }
};
