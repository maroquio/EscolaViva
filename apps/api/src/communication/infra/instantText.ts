export function toText(instant: Date): string {
  return instant.toISOString();
}

export function toTextOrNull(instant: Date | null): string | null {
  return instant === null ? null : instant.toISOString();
}
