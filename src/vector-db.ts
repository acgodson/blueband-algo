import { LocalDocumentIndex } from "./LocalDocumentIndex";
import { OpenAIEmbeddings } from "./OpenAIEmbeddings";
import { Colorize } from "./internals";
import dotenv from "dotenv";
dotenv.config();

const openaiKey = process.env.NEXT_PUBLIC_OPENAI_KEY;

//TODO: use index to update the catalog later
export async function createIndex(apiKey: string) {
  //algo Txn
  const indexInstance = new LocalDocumentIndex({
    agent: "",
    apiKey: apiKey,
  });
  console.log(Colorize.output(`indexing on IPFS`));
  const newIndex = await indexInstance.createIndex({
    version: 1,
    deleteIfExists: true,
    apiKey: apiKey,
  });
  if (newIndex) {
    return newIndex;
  }
}

export async function addDocuments(
  indexName: string, //ipnsName, we query on the front end for this
  apiKey: string,
  agent: string, //Event creator
  appID: number,
  uris: string[],
  chunkSize: number,
  indexerClient: any,
  decryptedTexts?: string[]
) {
  const embeddings = new OpenAIEmbeddings({
    apiKey: openaiKey as string,
    model: "text-embedding-ada-002",
    logRequests: true,
  });

  const loadIsCatalog = async () => {
    if (!agent) {
      console.log("no agent submitted");
      return true;
    }

    try {
      const prefix = `Buni${appID}`;
      const response = await indexerClient
        .searchForAssets()
        .creator(agent)
        .name(prefix)
        .do();

      if (response.assets.length < 0) {
        return false;
      }

      return true;
    } catch (err: unknown) {
      return false;
    }
  };

  const getDocumentID = async (prefix: string) => {
    let responseCID;
    try {
      const prefix = `Buni${appID}`;
      const response = await indexerClient
        .searchForAssets()
        .creator(agent)
        .name(prefix)
        .do();

      if (response.assets.length > 0) {
        const assetID = response.assets[0].index;
        console.log(`Found Asset ID: ${assetID}`);

        const txResponse = await indexerClient
          .searchForTransactions()
          .assetID(assetID)
          .txType("acfg")
          .do();
        if (txResponse.transactions.length > 0) {
          const noteField = txResponse.transactions[0].note;
          const decodedNote = Buffer.from(noteField, "base64").toString();
          const [appID, ipfsCID] = decodedNote.split(":");
          responseCID = ipfsCID;
        } else {
          console.log(
            "No asset creation transactions found for the specified asset ID."
          );
        }

        return responseCID;
      }
    } catch (e) {
      console.log(e);
    }

    return responseCID;
  };

  const getDocumentUri = async (prefix: string) => {
    let responseCID = "";
    try {
      try {
        const prefix = `Buni${appID}`;
        const response = await indexerClient
          .searchForAssets()
          .creator(agent)
          .name(prefix)
          .do();

        if (response.assets.length > 0) {
          const assetID = response.assets[0].index;
          console.log(`Found Asset ID: ${assetID}`);

          const txResponse = await indexerClient
            .searchForTransactions()
            .assetID(assetID)
            .txType("acfg")
            .do();
          if (txResponse.transactions.length > 0) {
            const noteField = txResponse.transactions[0].note;
            const decodedNote = Buffer.from(noteField, "base64").toString();
            const [appID, ipfsCID] = decodedNote.split(":");
            responseCID = ipfsCID;
          } else {
            console.log(
              "No asset creation transactions found for the specified asset ID."
            );
          }

          return responseCID;
        }
      } catch (e) {
        console.log(e);
      }

      responseCID;
    } catch (e) {
      console.log(e);
    }
  };

  const isCatalog = await loadIsCatalog();

  const indexInstance = new LocalDocumentIndex({
    indexName: indexName,
    apiKey: apiKey,
    agent: "0x5D75A8d20ddDA716e716ff2a138c06727365d247",
    embeddings,
    isCatalog: isCatalog,
    _getDocumentId: getDocumentID,
    _getDoumentUri: getDocumentUri,
    chunkingConfig: {
      chunkSize: chunkSize,
    },
  });

  // const webFetcher = new WebFetcher();
  let ids: any[] = [];

  for (let i = 0; i < uris.length; i++) {
    const uri = uris[i];
    let documentResult;

    try {
      if (decryptedTexts) {
        const decryptedText = decryptedTexts[i];
        documentResult = await indexInstance.upsertDocument(
          uri,
          decryptedText,
          "text/plain"
        );
        ids.push(documentResult.id);
        console.log(Colorize.replaceLine(Colorize.success(`added ${uri}`)));
      }
    } catch (err: unknown) {
      console.log(
        Colorize.replaceLine(
          Colorize.error(`Error adding: ${uri}\n${(err as Error).message}`)
        )
      );
    }
  }

  return { uris, ids };
}

export async function queryIndex(
  indexName: string,
  agent: string,
  appID: number,
  apiKey: string,
  query: string,
  documentCount: number,
  chunkCount: number,
  sectionCount: number,
  tokens: number,
  format: string,
  overlap: boolean,
  indexerClient: any
) {
  // Initialize an array to store the results
  const queryResults = [];

  const embeddings = new OpenAIEmbeddings({
    apiKey: openaiKey as string,
    model: "text-embedding-ada-002",
    logRequests: true,
  });

  const loadIsCatalog = async () => {
    if (!agent) {
      console.log("no agent submitted");
      return true;
    }

    try {
      const prefix = `Buni${appID}`;
      const response = await indexerClient
        .searchForAssets()
        .creator(agent)
        .name(prefix)
        .do();

      if (response.assets.length < 0) {
        return false;
      }

      return true;
    } catch (err: unknown) {
      return false;
    }
  };

  const getDocumentID = async (prefix: string) => {
    let responseCID;
    try {
      const prefix = `Buni${appID}`;
      const response = await indexerClient
        .searchForAssets()
        .creator(agent)
        .name(prefix)
        .do();

      if (response.assets.length > 0) {
        const assetID = response.assets[0].index;
        console.log(`Found Asset ID: ${assetID}`);

        const txResponse = await indexerClient
          .searchForTransactions()
          .assetID(assetID)
          .txType("acfg")
          .do();
        if (txResponse.transactions.length > 0) {
          const noteField = txResponse.transactions[0].note;
          const decodedNote = Buffer.from(noteField, "base64").toString();
          const [appID, ipfsCID] = decodedNote.split(":");
          responseCID = ipfsCID;
        } else {
          console.log(
            "No asset creation transactions found for the specified asset ID."
          );
        }

        return responseCID;
      }
    } catch (e) {
      console.log(e);
    }

    return responseCID;
  };

  const getDocumentUri = async (prefix: string) => {
    let responseCID = "";
    try {
      try {
        const prefix = `Buni${appID}`;
        const response = await indexerClient
          .searchForAssets()
          .creator(agent)
          .name(prefix)
          .do();

        if (response.assets.length > 0) {
          const assetID = response.assets[0].index;
          console.log(`Found Asset ID: ${assetID}`);

          const txResponse = await indexerClient
            .searchForTransactions()
            .assetID(assetID)
            .txType("acfg")
            .do();
          if (txResponse.transactions.length > 0) {
            const noteField = txResponse.transactions[0].note;
            const decodedNote = Buffer.from(noteField, "base64").toString();
            const [appID, ipfsCID] = decodedNote.split(":");
            responseCID = ipfsCID;
          } else {
            console.log(
              "No asset creation transactions found for the specified asset ID."
            );
          }

          return responseCID;
        }
      } catch (e) {
        console.log(e);
      }

      responseCID;
    } catch (e) {
      console.log(e);
    }
  };

  const isCatalog = await loadIsCatalog();

  // Initialize index
  const indexInstance = new LocalDocumentIndex({
    indexName: indexName,
    apiKey: apiKey,
    agent: "0x5D75A8d20ddDA716e716ff2a138c06727365d247",
    embeddings,
    isCatalog: isCatalog,
    _getDocumentId: getDocumentID,
    _getDoumentUri: getDocumentUri,
  });

  // Query index
  const results = await indexInstance.queryDocuments(query, {
    maxDocuments: documentCount,
    maxChunks: chunkCount,
  });

  // Process each result
  for (const result of results) {
    const resultObj: any = {
      uri: result.uri,
      score: result.score,
      chunks: result.chunks.length,
      sections: [],
    };

    // Render sections if format is "sections"
    if (format === "sections") {
      const sections = await result.renderSections(
        tokens,
        sectionCount,
        overlap
      );
      resultObj.sections = sections.map((section, index) => ({
        title: sectionCount === 1 ? "Section" : `Section ${index + 1}`,
        score: section.score,
        tokens: section.tokenCount,
        text: section.text,
      }));
    }

    queryResults.push(resultObj);
  }

  return queryResults;
}
