import { google } from "googleapis";
import { Readable } from "stream";

function getDriveClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");

  const json = JSON.parse(raw.replace(/\\n/g, "\n"));

  const auth = new google.auth.JWT({
    email: json.client_email,
    key: json.private_key,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  return google.drive({ version: "v3", auth });
}

export async function uploadPdfToDriveFolder(opts: {
  folderId: string;
  fileName: string;
  pdfBuffer: Buffer;
}) {
  const drive = getDriveClient();

  const media = {
    mimeType: "application/pdf",
    body: Readable.from(opts.pdfBuffer),
  };

  const res = await drive.files.create({
    requestBody: {
      name: opts.fileName,
      parents: [opts.folderId],
      mimeType: "application/pdf",
    },
    media,
    supportsAllDrives: true,
    fields: "id, webViewLink",
  });

  if (!res.data.id) throw new Error("Drive upload failed — no file ID returned");

  return res.data;
}
