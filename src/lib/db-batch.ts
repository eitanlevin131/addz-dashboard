export const DB_WRITE_BATCH_SIZE = 250;

export function batchesOf<T>(items: T[], size = DB_WRITE_BATCH_SIZE) {
  if (!Number.isInteger(size) || size < 1) throw new Error("Batch size must be a positive integer");
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}
