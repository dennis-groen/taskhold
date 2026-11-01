import { z } from "zod";

const todoName = z
  .string()
  .trim()
  .min(1, "Write what you need to do.")
  .max(100, "Keep it under 100 characters.");

// Blank means no notes
const notes = z
  .string()
  .trim()
  .max(1000, "Keep notes under 1000 characters.")
  .transform((value) => value || null)
  .nullable();

const dueOn = z.iso
  .date("Use a date like 2026-03-14.")
  .transform((value) => Temporal.PlainDate.from(value))
  .nullable();

export const todoParam = z.object({
  todoId: z.string().min(1).max(64),
});

export const createTodoBody = z.object({
  // Optional client-chosen id, so an optimistically added to-do keeps its identity
  id: z.uuid().optional(),
  name: todoName,
  notes: notes.optional(),
  dueOn: dueOn.optional(),
});

export const updateTodoBody = z
  .object({
    name: todoName.optional(),
    notes: notes.optional(),
    dueOn: dueOn.optional(),
    done: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "Nothing to change.",
  });
