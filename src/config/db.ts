import mongoose from "mongoose";

const DEFAULT_MONGODB_URI = "mongodb://localhost:27017/ticketmind";

let mongoConnectionPromise: Promise<typeof mongoose> | null = null

export const connectMongo = async (uri?: string): Promise<void> => {
  const mongoUri = uri ?? process.env["MONGODB_URI"] ?? DEFAULT_MONGODB_URI;

  try {
    if (!mongoConnectionPromise) {
      mongoConnectionPromise = mongoose.connect(mongoUri)
    }

    await mongoConnectionPromise;
  } catch (error) {
    mongoConnectionPromise = null
    throw error;
  }
};

export const disconnectMongo = async (): Promise<void> => {
  mongoConnectionPromise = null
  await mongoose.disconnect()
}
