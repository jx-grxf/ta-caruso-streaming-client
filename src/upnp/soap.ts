export function readSoapAction(headers: Record<string, string | string[] | undefined>): string | undefined {
  const header = headers.soapaction;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) {
    return undefined;
  }

  const normalized = value.replaceAll('"', "");
  return normalized.split("#").at(-1);
}
