import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

export const  getSource = async(source:string):Promise<string> => {
  const rl = readline.createInterface({ input, output });

  let link: string | null = null;

  try {
    while (link === null) {
      output.write(`Where is this document from? \n ${source}\n`);
      link = await rl.question('');

      output.write(`Are you sure? Y/N \n`);
      const confirmation = await rl.question('');

      if (confirmation.toLowerCase() !== 'y') {
        link = null;
      }
    }
  } catch (error) {
    console.error('An error occurred during input reading: ', error);
    throw new Error('An error occurred during input reading: ');
  } finally {
    await rl.close();
  }
  return Promise.resolve(link);

}