import { Tokenizer } from "./types";
export declare class GPT3Tokenizer implements Tokenizer {
    decode(tokens: number[]): string;
    encode(text: string): number[];
}
