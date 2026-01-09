import { Router } from "express";
import PDFDocument from "pdfkit";
import { uploadPdfToDriveFolder } from "../services/googleDrive";

const router = Router();

router.get("/_debug/drive-upload-test", async (_req, res) => {
  try {
    // 1) Create a tiny in-memory PDF
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", async () => {
      const pdfBuffer = Buffer.concat(chunks);

      // 2) Upload it
      const result = await uploadPdfToDriveFolder({
        folderId: "1oDM1z4YD8VuBGcTOuwKvW9Dtu6Nw7V8Z", // your test folder
        fileName: `TEST UPLOAD ${Date.now()}.pdf`,
        pdfBuffer,
      });

      res.json({
        success: true,
        fileId: result.id,
        link: result.webViewLink,
      });
    });

    doc.text("Taska Drive upload test — if you can read this, it worked.");
    doc.end();
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
