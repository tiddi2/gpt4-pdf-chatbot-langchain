import { ChatOpenAI } from 'langchain/chat_models/openai';
import { LLMChain } from 'langchain/chains';
import { PromptTemplate } from 'langchain/prompts';

const QA_PROMPT = `Beskriv hva GPT skal gjøre her.

{context}

Question: {question}
Svar:`;

export const makeChain = async (
  question: string,
  history: [string, string][],
) => {
  const model = new ChatOpenAI({
    temperature: 0,
    azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
    azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
    azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME,
    azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
  });

  const prompt = PromptTemplate.fromTemplate(QA_PROMPT);

  const chain = new LLMChain({ llm: model, prompt: prompt });

  const res = await chain.call({
    context: history,
    question: question,
    word: 'Ord',
  });
  console.log(res);
  return res;
};
