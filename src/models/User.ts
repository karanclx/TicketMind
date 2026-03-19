import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 5,
      maxlength: 254
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      maxlength: 255,
      select: false
    },
    role: {
      type: String,
      required: true,
      enum: ["admin", "agent", "user"],
      default: "user"
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

userSchema.index({ email: 1 }, { unique: true });

export type User = InferSchemaType<typeof userSchema>;
export const UserModel: Model<User> = model<User>("User", userSchema);
