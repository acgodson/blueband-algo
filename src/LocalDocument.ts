import { MetadataTypes } from "./types";
import { LocalDocumentIndex } from "./LocalDocumentIndex";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

/**
 * Represents an indexed document stored on filecoin.
 */
export class LocalDocument {
  private readonly _index: LocalDocumentIndex;
  private readonly _id: string;
  private readonly _uri: string;
  private _metadata: Record<string, MetadataTypes> | undefined;
  private _text: string | undefined;

  public constructor(index: LocalDocumentIndex, id: string, uri: string) {
    this._index = index;
    this._id = id;
    this._uri = uri;
  }

  public get id(): string {
    return this._id;
  }

  public get uri(): string {
    return this._uri;
  }

  public async getLength(): Promise<number> {
    const text = await this.loadText();
    if (text.length <= 40000) {
      return this._index.tokenizer.encode(text).length;
    } else {
      return Math.ceil(text.length / 4);
    }
  }

  public async hasMetadata(): Promise<boolean> {
    try {
      return false;
    } catch (err: unknown) {
      return false;
    }
  }

  public async loadMetadata(): Promise<Record<string, MetadataTypes>> {
    if (this._metadata == undefined) {
      let json: string;
      try {
        json = "";
      } catch (err: unknown) {
        throw new Error(
          `Error reading metadata for document "${this.uri}": ${(
            err as any
          ).toString()}`
        );
      }

      try {
        this._metadata = JSON.parse(json);
      } catch (err: unknown) {
        throw new Error(
          `Error parsing metadata for document "${this.uri}": ${(
            err as any
          ).toString()}`
        );
      }
    }

    return this._metadata!;
  }

  public async loadText(): Promise<string> {
    if (this._text == undefined) {
      try {
        const result = await this._index.getDocumentId(
          this._uri,
          this._index.lightHouseKey
        );

        const response = await axios.get(
          `https://gateway.lighthouse.storage/ipfs/${result}`
        );
        const data = response.data;
        if (data) {
          this._text = data;
        }
      } catch (err: unknown) {
        throw new Error(
          `Error reading text file for document "${this.uri}": ${(
            err as any
          ).toString()}`
        );
      }
    }
    return this._text || "";
  }
}
