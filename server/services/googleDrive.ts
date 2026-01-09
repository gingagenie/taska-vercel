import { google } from "googleapis";
import { Readable } from "stream";

function getServiceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");
  }

  // Railway often escapes newlines
  const json = JSON.parse(raw.replace(/\\n/g, "\n"));

  return {
    client_email: json.client_email,
    private_key: json.private_key,
  };
}

function getDriveClient() {
  const sa = getServiceAccount();

  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
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

  const response = await drive.files.create({
    requestBody: {
      name: opts.fileName,
      parents: [opts.folderId],
      mimeType: "application/pdf",
    },
    media,
    supportsAllDrives: true,
    fields: "id, webViewLink",
  });

  if (!response.data.id) {
    throw new Error("Drive upload failed — no file ID returned");
  }

  return response.data;
}
