// Minimal PDF writer that embeds JPEG images, one per page, with zero external dependencies.
// Each page is sized to match the image's aspect ratio so nothing gets stretched or cropped.

export type PdfImage = { bytes: Uint8Array; widthPx: number; heightPx: number };

const textEncoder = new TextEncoder();
const MAX_POINTS = 1000;

function toBytes(input: string | Uint8Array): Uint8Array {
  return typeof input === "string" ? textEncoder.encode(input) : input;
}

export async function createPdfFromJpegImages(images: PdfImage[]): Promise<Blob> {
  if (images.length === 0) {
    throw new Error("No images to build a PDF from.");
  }

  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;

  const push = (chunk: string | Uint8Array) => {
    const bytes = toBytes(chunk);
    parts.push(bytes);
    length += bytes.length;
  };

  const startObject = (num: number) => {
    offsets[num] = length;
    push(`${num} 0 obj\n`);
  };

  const totalObjects = 2 + images.length * 3; // catalog + pages + (page, content, image) per image

  push("%PDF-1.4\n");

  // Object 1: catalog
  startObject(1);
  push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  const kids = images.map((_, i) => `${3 + i * 3} 0 R`).join(" ");

  // Object 2: pages tree (written now, content depends only on ids we already know)
  startObject(2);
  push(`<< /Type /Pages /Kids [${kids}] /Count ${images.length} >>\nendobj\n`);

  images.forEach((image, i) => {
    const pageObjNum = 3 + i * 3;
    const contentObjNum = 4 + i * 3;
    const imageObjNum = 5 + i * 3;

    const scale = Math.min(1, MAX_POINTS / Math.max(image.widthPx, image.heightPx));
    const pageWidth = Math.max(1, image.widthPx * scale);
    const pageHeight = Math.max(1, image.heightPx * scale);

    startObject(pageObjNum);
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(
        2,
      )}] /Resources << /XObject << /Im0 ${imageObjNum} 0 R >> >> /Contents ${contentObjNum} 0 R >>\nendobj\n`,
    );

    const contentStream = `q ${pageWidth.toFixed(2)} 0 0 ${pageHeight.toFixed(2)} 0 0 cm /Im0 Do Q`;
    const contentBytes = toBytes(contentStream);
    startObject(contentObjNum);
    push(`<< /Length ${contentBytes.length} >>\nstream\n`);
    push(contentBytes);
    push("\nendstream\nendobj\n");

    startObject(imageObjNum);
    push(
      `<< /Type /XObject /Subtype /Image /Width ${image.widthPx} /Height ${image.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`,
    );
    push(image.bytes);
    push("\nendstream\nendobj\n");
  });

  const xrefOffset = length;
  push(`xref\n0 ${totalObjects + 1}\n`);
  push("0000000000 65535 f \n");
  for (let i = 1; i <= totalObjects; i += 1) {
    push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return new Blob(parts as BlobPart[], { type: "application/pdf" });
}
