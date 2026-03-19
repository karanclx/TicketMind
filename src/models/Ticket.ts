import { Schema, model, type InferSchemaType, type Model, Types } from "mongoose";

const ticketSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 200
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 5000
    },
    category: {
      type: String,
      required: false,
      enum: ["Network", "Hardware", "Software", "Unclassified"],
      default: "Unclassified"
    },
    priority: {
      type: String,
      required: false,
      enum: ["High", "Medium", "Low", "Unassigned"],
      default: "Unassigned"
    },
    status: {
      type: String,
      required: true,
      enum: ["Open", "InProgress", "Resolved", "Closed"],
      default: "Open"
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    resolvedAt: {
      type: Date,
      required: false
    },
    slaDeadline: {
      type: Date,
      required: false
    },
    tags: {
      type: [String],
      default: [],
      maxlength: 20
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

ticketSchema.index({ status: 1, slaDeadline: 1 });
ticketSchema.index({ createdAt: -1 });
ticketSchema.index({ assignedTo: 1, status: 1 });
ticketSchema.index({ createdBy: 1, createdAt: -1 });

export type Ticket = InferSchemaType<typeof ticketSchema> & {
  assignedTo?: Types.ObjectId;
  createdBy: Types.ObjectId;
};

export const TicketModel: Model<Ticket> = model<Ticket>("Ticket", ticketSchema);
