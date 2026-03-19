import mongoose from "mongoose";

const DEFAULT_MONGODB_URI = "mongodb://localhost:27017/ticketmind";

export const connectMongo = async (uri?: string): Promise<void> => {
  const mongoUri = uri ?? process.env["MONGODB_URI"] ?? DEFAULT_MONGODB_URI;

  try {
    await mongoose.connect(mongoUri);
  } catch (error) {
    throw error;
  }
};
