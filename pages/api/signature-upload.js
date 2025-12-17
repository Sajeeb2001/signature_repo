const SERVICEM8_API_KEY = process.env.SERVICEM8_API_KEY; // Store your ServiceM8 API key securely in environment variables
const SM8_BASE = "https://api.servicem8.com/api_1.0";
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args)); // NodeJS fetch polyfill
const FormData = require("form-data"); // For handling file uploads

export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*"); // Replace "*" with your frontend domain in production
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Validate request method
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST for this endpoint." });
  }

  try {
    // Parse the incoming request body
    const { jobUUID, signature } = req.body;

    // Input validation
    if (!jobUUID) {
      return res.status(400).json({ error: "Missing 'jobUUID' in request body." });
    }
    if (!signature || !signature.startsWith("data:image")) {
      return res.status(400).json({ error: "Invalid or missing 'signature' in base64 image format." });
    }

    // Decode base64 signature into binary data
    const signatureBinary = Buffer.from(
      signature.replace(/^data:image\/\w+;base64,/, ""), // Strip "data:image/png;base64," prefix
      "base64"
    );

    // Enforce size limits (e.g., max 1MB)
    if (signatureBinary.byteLength > 1024 * 1024) { // 1MB limit
      return res.status(413).json({ error: "Attachment exceeds file size limit (1MB)." });
    }

    // Step 1: Create Attachment Metadata
    const filename = `signature-${jobUUID}.png`; // Generate a unique filename
    const metadataPayload = {
      job_uuid: jobUUID,
      filename: filename,
      type: "image/png", // MIME type for the attachment
    };

    const metadataResponse = await fetch(`${SM8_BASE}/Attachment.json`, {
      method: "POST",
      headers: {
        "X-Api-Key": SERVICEM8_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(metadataPayload),
    });

    if (!metadataResponse.ok) {
      const errorText = await metadataResponse.text();
      console.error("Error creating attachment metadata:", errorText);
      return res.status(metadataResponse.status).json({ error: "Failed to create attachment metadata in ServiceM8." });
    }

    const metadata = await metadataResponse.json();
    const attachmentUUID = metadata.uuid; // Extract attachment UUID for the next step

    // Step 2: Upload File Binary
    const formData = new FormData();
    formData.append("file", signatureBinary, {
      filename: filename,
      contentType: "image/png",
    });

    const fileUploadResponse = await fetch(`${SM8_BASE}/Attachment/${attachmentUUID}.file`, {
      method: "POST",
      headers: {
        "X-Api-Key": SERVICEM8_API_KEY,
        ...formData.getHeaders(), // Include necessary multipart headers
      },
      body: formData,
    });

    if (!fileUploadResponse.ok) {
      const errorText = await fileUploadResponse.text();
      console.error("Error uploading file binary:", errorText);
      return res.status(fileUploadResponse.status).json({ error: "Failed to upload the signature file to ServiceM8." });
    }

    // Final success response
    return res.status(200).json({
      success: true,
      message: "Signature file uploaded to ServiceM8 successfully.",
    });

  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Internal server error: " + err.message });
  }
}