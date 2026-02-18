import { google } from "googleapis";
import { Readable } from "stream";

function getDriveClient() {
  let raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  
  // Support base64-encoded JSON (for Railway compatibility)
  if (!raw && process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64) {
    raw = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64, 'base64').toString('utf-8');
  }
  
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");

  const json = JSON.parse(raw);

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

export async function findOrCreateFolder(
  parentFolderId: string,
  folderName: string
): Promise<string> {
  const drive = getDriveClient();

  const searchRes = await drive.files.list({
    q: `name='${folderName.replace(/'/g, "\\'")}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  if (searchRes.data.files && searchRes.data.files.length > 0) {
    return searchRes.data.files[0].id!;
  }

  const createRes = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId],
    },
    fields: "id",
    supportsAllDrives: true,
  });

  if (!createRes.data.id) {
    throw new Error("Failed to create folder in Google Drive");
  }

  return createRes.data.id;
}

export async function uploadServiceSheet(opts: {
  equipmentName: string;
  pdfBuffer: Buffer;
  date: string;
  existingFolderId?: string | null;
}): Promise<{ folderId: string; fileId: string }> {
  const PLANT_ACCESS_FOLDER_ID = "1TbZG8SRz5F3KICWm5Rim9uykRziWLL_2";

  let folderId: string;
  if (opts.existingFolderId) {
    folderId = opts.existingFolderId;
  } else {
    folderId = await findOrCreateFolder(
      PLANT_ACCESS_FOLDER_ID,
      opts.equipmentName
    );
  }

  const fileName = `${opts.date}.pdf`;
  const uploadResult = await uploadPdfToDriveFolder({
    folderId,
    fileName,
    pdfBuffer: opts.pdfBuffer,
  });

  return {
    folderId,
    fileId: uploadResult.id!,
  };
}
