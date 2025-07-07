// Copyright (c) Microsoft Corporation
// Licensed under the MIT license.

/**
 * A strongly-typed JSON value.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Parses a ReadableStream<Uint8Array> into a JSON value.
 *
 * @param body - The stream body of the request.
 * @param encoding - The encoding to use for decoding the stream as text. Defaults to "utf-8".
 * @returns A promise that resolves to the parsed JSON value.
 */
export function parseJson(
  body: ReadableStream<Uint8Array>,
  encoding: string = "utf-8",
): Promise<JsonValue> {
  return new Promise((resolve, reject) => {
    const reader = body.getReader();
    const decoder = new TextDecoder(encoding);
    let result = "";

    function read() {
      reader
        .read()
        .then(({ done, value }) => {
          if (done) {
            try {
              resolve(JSON.parse(result));
            } catch (e) {
              reject(e);
            }
            return;
          }

          result += decoder.decode(value, { stream: true });
          read();
        })
        .catch(reject);
    }

    read();
  });
}
