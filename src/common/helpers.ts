export function getApiResponse(statusCode: number, body: string) {
  return {
    statusCode,
    body,
    headers: {
      'Content-Type': 'application/json',
    },
  };
}