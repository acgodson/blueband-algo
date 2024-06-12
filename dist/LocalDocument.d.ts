import { MetadataTypes } from "./types";
import { LocalDocumentIndex } from "./LocalDocumentIndex";
/**
 * Represents an indexed document stored on filecoin.
 */
export declare class LocalDocument {
    private readonly _index;
    private readonly _id;
    private readonly _uri;
    private _metadata;
    private _text;
    constructor(index: LocalDocumentIndex, id: string, uri: string);
    get id(): string;
    get uri(): string;
    getLength(): Promise<number>;
    hasMetadata(): Promise<boolean>;
    loadMetadata(): Promise<Record<string, MetadataTypes>>;
    loadText(): Promise<string>;
}
