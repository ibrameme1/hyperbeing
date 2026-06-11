// Anthropic rejects image attachments whose base64 payload exceeds 10MB, so
// large photos get downscaled/recompressed client-side before upload.
const MAX_DIMENSION = 2048;
const MAX_DATA_URL_LENGTH = 7 * 1024 * 1024;

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Reads an image file, returning { data, mimeType } as a data URL. Images
// larger than MAX_DIMENSION or MAX_DATA_URL_LENGTH are downscaled and
// re-encoded as JPEG to keep the payload within the API's limits.
export async function fileToImageAttachment(file) {
  const dataUrl = await readAsDataURL(file);

  const img = await new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });

  if (!img) return { data: dataUrl, mimeType: file.type };

  const withinDimensions = img.width <= MAX_DIMENSION && img.height <= MAX_DIMENSION;
  if (withinDimensions && dataUrl.length <= MAX_DATA_URL_LENGTH) {
    return { data: dataUrl, mimeType: file.type };
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  let quality = 0.9;
  let out = canvas.toDataURL('image/jpeg', quality);
  while (out.length > MAX_DATA_URL_LENGTH && quality > 0.4) {
    quality -= 0.1;
    out = canvas.toDataURL('image/jpeg', quality);
  }
  return { data: out, mimeType: 'image/jpeg' };
}
