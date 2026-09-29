export function documentBlobToken() {
  return process.env.AI_DOCUMENTS_READ_WRITE_TOKEN
    || process.env.BLOB_READ_WRITE_TOKEN;
}
