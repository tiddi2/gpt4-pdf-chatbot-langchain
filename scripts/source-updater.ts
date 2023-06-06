import { pinecone } from '@/utils/pinecone-client';
import { PINECONE_INDEX_NAME, PINECONE_NAME_SPACE } from '@/config/pinecone';
import { PineconeStore } from 'langchain/vectorstores/pinecone';
import { OpenAIEmbeddings } from "langchain/embeddings/openai";

export const checkIfSourceIsAlreadyInIndex = async (text:string) => {
  const pineconeIndex = pinecone.Index(PINECONE_INDEX_NAME);

  const vectorStore = await PineconeStore.fromExistingIndex(
    new OpenAIEmbeddings({
      azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
      azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
      azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME,
      azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
    }),
    {
      pineconeIndex: pineconeIndex,
      textKey: 'text',
      namespace: PINECONE_NAME_SPACE, //namespace comes from your config folder
    }
  );
  const results = await vectorStore.similaritySearch("", 50, {
      source: text
  });
  for(let i = 0; i < results.length; i++) {
    if(results[i].metadata.source == text) {
      return true;
    }
  } 
  return false;

}
