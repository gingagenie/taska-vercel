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

/**
 * Upload a PDF to a Google Drive folder
 */
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

/**
 * Find or create a folder by name within a parent folder
 * 
 * @param parentFolderId - The parent folder ID (e.g. "Plant Access Service Records")
 * @param folderName - The name of the folder to find/create (e.g. "Crown Broken Down")
 * @returns The folder ID
 */
export async function findOrCreateFolder(
  parentFolderId: string,
  folderName: string
): Promise<string> {
  const drive = getDriveClient();

  // First, try to find existing folder
  const searchRes = await drive.files.list({
    q: `name='${folderName.replace(/'/g, "\\'")}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  if (searchRes.data.files && searchRes.data.files.length > 0) {
    // Folder exists, return its ID
    return searchRes.data.files[0].id!;
  }

  // Folder doesn't exist, create it
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

/**
 * Upload a service sheet PDF to the equipment's Google Drive folder
 * Creates the folder if it doesn't exist
 * 
 * @param equipmentName - Name of the equipment (becomes folder name)
 * @param pdfBuffer - The PDF file as a Buffer
 * @param date - Date for the filename (e.g. "2026-02-18")
 * @returns Object with folderId and fileId
 */
export async function uploadServiceSheet(opts: {
  equipmentName: string;
  pdfBuffer: Buffer;
  date: string; // Format: "YYYY-MM-DD"
  existingFolderId?: string | null; // If we already know the folder ID
}): Promise<{ folderId: string; fileId: string }> {
  // Parent folder ID for "Plant Access Service Records"
  const PLANT_ACCESS_FOLDER_ID = "1TbZG8SRz5F3KICWm5Rim9uykRziWLL_2";

  // Find or create the equipment folder
  let folderId: string;
  if (opts.existingFolderId) {
    folderId = opts.existingFolderId;
  } else {
    folderId = await findOrCreateFolder(
      PLANT_ACCESS_FOLDER_ID,
      opts.equipmentName
    );
  }

  // Upload the PDF
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