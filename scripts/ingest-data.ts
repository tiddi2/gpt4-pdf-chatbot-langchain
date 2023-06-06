import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { PineconeStore } from 'langchain/vectorstores/pinecone';
import { pinecone } from '@/utils/pinecone-client';
import { PINECONE_INDEX_NAME, PINECONE_NAME_SPACE } from '@/config/pinecone';
import { PDFLoader } from 'langchain/document_loaders/fs/pdf';
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory';
import { ChatOpenAI } from 'langchain/chat_models/openai';
import { HumanChatMessage, SystemChatMessage } from 'langchain/schema';
import { UnstructuredLoader } from 'langchain/document_loaders/fs/unstructured';
import { Document } from 'langchain/document';
import { checkIfSourceIsAlreadyInIndex } from './source-updater';
import { getSource } from './get-source';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

/* Name of directory to retrieve your files from */
const filePath = 'docs';

const cleanWithRegex = (text: string) => {
  const textNoNewLines = text.replace(/(\n)/g, ' ');
  return textNoNewLines.replace(/(\.{4}|\ {3})/g, '');
};

const cleanWithGPT35Turbo = async (
  text: string,
  source?: string,
): Promise<string> => {
  const model = new ChatOpenAI({
    temperature: 0,
    maxTokens: 3000,
    modelName: 'gpt-35-turbo',
    azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
    azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
    azureOpenAIApiDeploymentName:
      process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME_GPT35,
    azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
  });
  console.log(`Currently working on ${source}`);
  const MAX_RETRIES = 3;
  let hasFailed = false;
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      if (hasFailed) {
        console.log(text);
      }
      const res1 = await model.call([
        new SystemChatMessage(
          'You are a grammar expert and a proofreader. Your task is to read the text sent by the user and report back if the text needs corrections. You should base this on incorrect spacing, tags that doesnt add any value to the text and unnecessary repeating characters. Your reply should always be one character long. If the text does not need proofreading, reply with 0, nothing else. If the text does require proofreading you should reply with 1, nothing else. Here is an example reply if the text does not need proof reading: 0. Here is an example reply if the text does require proof reading: 1',
        ),
        new HumanChatMessage(text),
      ]);
      if (hasFailed) {
        console.log(res1);
      }
      if (Number(res1.text) == 0) {
        return Promise.resolve(text);
      }

      const res2 = await model.call([
        new SystemChatMessage(
          'You are a grammar expert and a proofreader. Your task is to read the text sent by the user and fix spelling errors, incorrect spacing, tags that doesnt add any value to the text and unnecessary repeating characters. Reply only with the corrected text, and nothing else.',
        ),
        new HumanChatMessage(text),
      ]);
      if (hasFailed) {
        console.log(res2);
      }
      return Promise.resolve(res2.text);
    } catch (error) {
      if (i === MAX_RETRIES - 1) {
        // if this was the last attempt
        console.log(`Operation failed after ${i + 1} attempts: ${error}`);
        return Promise.resolve(text);
      } else {
        hasFailed = true;
        console.log(`Attempt ${i + 1} failed for ${source}. Retrying...`);
      }
    }
  }
  //Fallback, should never run
  console.log('There is a bug if this line of code run: ID:ksdmgjw442');
  return Promise.resolve(text);
};

const splitIntoChunks = async (rawDocks: Document[]) => {
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1350, //1012 tokens
    chunkOverlap: 200,
  });
  return await textSplitter.splitDocuments(rawDocks);
};

const createSourceMap = (
  documents: Document[],
): { [key: string]: number[] } => {
  let sourceMap: { [key: string]: number[] } = {};
  for (let i = 0; i < documents.length; i++) {
    const docSource: string = documents[i].metadata.source;
    if (sourceMap[docSource]) {
      sourceMap[docSource].push(i);
    } else {
      sourceMap[docSource] = [i];
    }
  }

  return sourceMap;
};

const getSourcesFromUser = async (
  documents: Document[],
  sourceMap: { [key: string]: number[] },
): Promise<Document<Record<string, any>>[]> => {
  for (let source in sourceMap) {
    const newSource = await getSource(source);
    for (let i = 0; i < sourceMap[source].length; i++) {
      documents[sourceMap[source][i]].metadata.source = newSource;
    }
  }
  return documents;
};
export const run = async () => {
  try {
    const loader = new DirectoryLoader(filePath, {
      '.pdf': (path) => new PDFLoader(path, { splitPages: true }),
      '.ppt': (path) => new UnstructuredLoader(path, {}),
      '.pptx': (path) => new UnstructuredLoader(path, {}),
      '.doc': (path) => new UnstructuredLoader(path, {}),
      '.docx': (path) => new UnstructuredLoader(path, {}),
    });
    let rawDocks = await loader.load();
    let documentContent: any = {};

    for (let i = 0; i < rawDocks.length; i++) {
      if (rawDocks[i].metadata.source) {
        //Filetype is .pdf
        console.log('Cleaning up text on page:', i + 1, 'of', rawDocks.length);
        const pdfPageContentRegexCleaned = cleanWithRegex(
          rawDocks[i].pageContent,
        );
        const pdfPageContentGPTCleaned = await cleanWithGPT35Turbo(
          pdfPageContentRegexCleaned,
          rawDocks[i].metadata.source,
        );
        rawDocks[i].pageContent = pdfPageContentGPTCleaned;
      } else {
        //Filetype is not .pdf and is loaded with UnstructuredLoader
        const filename = rawDocks[i].metadata.filename
          .split('.')[0]
          .toLowerCase();
        if (documentContent[filename]) {
          documentContent[filename].pageContent += rawDocks[i].pageContent;
        } else {
          documentContent[filename] = {};
          documentContent[filename].pageContent = rawDocks[i].pageContent;
          documentContent[filename].metadata = rawDocks[i].metadata;
        }
        rawDocks.splice(i, 1);
        //Going one step back since element is removed.
        //The next element is on the current index after removing current element
        --i;
      }
    }
    for (let document in documentContent) {
      const doc = new Document({
        pageContent: documentContent[document].pageContent,
        metadata: { source: documentContent[document].metadata.filename },
      });
      const splittedDocs = await splitIntoChunks([doc]);
      for (let i = 0; i < splittedDocs.length; i++) {
        console.log(
          'Cleaning up text for:',
          doc.metadata.source,
          i + 1,
          'of',
          splittedDocs.length,
        );
        const fileContentGPTCleaned = await cleanWithGPT35Turbo(
          splittedDocs[i].pageContent,
          splittedDocs[i].metadata.source,
        );
        splittedDocs[i].pageContent = fileContentGPTCleaned;
      }
      rawDocks = rawDocks.concat(splittedDocs);
    }
    const sources = createSourceMap(rawDocks);
    rawDocks = await getSourcesFromUser(rawDocks, sources);
    console.log('creating vector store...');
    //create and store the embeddings in the vectorStore
    const embeddings = new OpenAIEmbeddings({
      azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
      azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
      azureOpenAIApiDeploymentName:
        process.env.AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME,
      azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
    });
    const index = pinecone.Index(PINECONE_INDEX_NAME); //change to your own index name
    let documentSkipList: string[] = [];
    for (let i = 0; i < rawDocks.length; i++) {
      //Check if document is already in database
      if (
        !documentSkipList.includes(rawDocks[i].metadata.source) &&
        (await checkIfSourceIsAlreadyInIndex(rawDocks[i].metadata.source))
      ) {
        const rl = readline.createInterface({ input, output });
        output.write(
          `${rawDocks[i].metadata.source} is already uploaded, do you want to skip this document? Y/N \n`,
        );
        const confirmation = await rl.question('');
        if (confirmation.toLowerCase() !== 'n') {
          documentSkipList.push(rawDocks[i].metadata.source);
          console.log('Document skipped');
          continue;
        }
      }
      /*await PineconeStore.fromDocuments([rawDocks[i]], embeddings, {
        pineconeIndex: index,
        namespace: PINECONE_NAME_SPACE,
        textKey: 'text',
      });
      */
    }
  } catch (error) {
    console.log('error', error);
    throw new Error('Failed to ingest your data');
  }
};

(async () => {
  await run();
  console.log('ingestion complete');
})();
