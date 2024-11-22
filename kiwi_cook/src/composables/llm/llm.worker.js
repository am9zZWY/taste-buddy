/* eslint-disable no-restricted-globals */
/**
 * Thanks to @xenova for the transformer package
 *
 * https://github.com/xenova
 */
import { pipeline, env } from '@xenova/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;
// env.backends.onnx.wasm.proxy = true;

class PipelineFactory {
  static task = null;

  static quantized = true;

  static model = null;

  // NOTE: instance stores a promise that resolves to the pipeline
  static instance = null;

  constructor(tokenizer, model) {
    this.tokenizer = tokenizer;
    this.model = model;
  }

  /**
   * Get pipeline instance
   * @param {*} progressCallback
   * @returns {Promise}
   */
  static getInstance(progressCallback = null) {
    if (this.task === null || this.model === null) {
      throw Error('Must set task and model');
    }
    if (this.instance === null) {
      this.instance = pipeline(this.task, this.model, {
        quantized: this.quantized,
        progress_callback: progressCallback,
      });
    }

    return this.instance;
  }
}

class SummarizationPipelineFactory extends PipelineFactory {
  static task = 'summarization';

  static quantized = false;

  static model = 'Xenova/distilbart-xsum-12-6';
}

async function summarize(data) {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const summaryPipeline = await SummarizationPipelineFactory.getInstance((data) => {
    self.postMessage({
      type: 'download',
      task: 'summarization',
      data,
    });
  });

  const config = {
    max_length: 80,
    min_length: 40,
    do_sample: true,
    early_stopping: false,
    temperature: 0.7,
    num_return_sequences: 1,
    max_time: 40,
    top_k: 50,
    top_p: 0.90,
    num_beams: 10,
    length_penalty: 0.8,
    no_repeat_ngram_size: 3,
  };

  return summaryPipeline(data.data, {
    ...config,
    callback_function(beams) {
      if (beams && beams.length > 0) {
        const decodedText = summaryPipeline.tokenizer.decode(beams[0].output_token_ids, {
          skip_special_tokens: true,
        });

        // Send back the updated summary
        self.postMessage({
          type: 'update',
          data: decodedText.trim(),
        });
      }
    },
  });
}

const TASK_FUNCTION_MAPPING = {
  summarization: summarize,
};

// Listen for messages from the main thread
self.addEventListener('message', async (event) => {
  const { data } = event;
  const fn = TASK_FUNCTION_MAPPING[data.task];

  if (!fn) return;

  try {
    const result = await fn(data);
    self.postMessage({
      task: data.task,
      type: 'result',
      data: result,
    });
  } catch (error) {
    self.postMessage({
      task: data.task,
      type: 'error',
      error,
    });
  }
});
