/** ISO 주 시작 시각 → 파일명용 슬러그 (콜론·점 제거) */
export function weekIsoToFileSlug(iso: string): string {
  return iso.replace(/[:.]/g, "-");
}

export function extForMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "bin";
}
