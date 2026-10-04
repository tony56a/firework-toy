import type * as Tf from '@tensorflow/tfjs';
import type { ClipClassifier } from './types';

const MODEL_URLS: ReadonlyArray<readonly [string, { fromTFHub: boolean }]> = [
  ['https://tfhub.dev/google/tfjs-model/yamnet/tfjs/1', { fromTFHub: true }],
  ['https://storage.googleapis.com/tfhub-tfjs-modules/google/tfjs-model/yamnet/tfjs/1/model.json', { fromTFHub: false }],
];
const CLASS_MAP_URL = 'https://raw.githubusercontent.com/tensorflow/models/master/research/audioset/yamnet/yamnet_class_map.csv';
const CLAP_CLASSES = new Set(['Clapping', 'Applause']);

/** Extracts the indices of the clap-related classes from YAMNet's class map CSV. */
export function parseClapClassIds(csv: string): number[] {
  const ids: number[] = [];
  for (const line of csv.split('\n').slice(1)) {
    const match = line.match(/^(\d+),[^,]*,(.*)$/);
    if (match && CLAP_CLASSES.has(match[2].replace(/^"|"$/g, '').trim())) ids.push(Number(match[1]));
  }
  return ids;
}

/** YAMNet audio-event classifier running on TensorFlow.js, loaded lazily as a separate chunk. */
export class YamnetClassifier implements ClipClassifier {
  private constructor(private readonly tf: typeof Tf, private readonly model: Tf.GraphModel, private readonly clapIds: number[]) {}

  static async load(customModelUrl?: string): Promise<YamnetClassifier> {
    const tf = await import('@tensorflow/tfjs');
    const candidates = customModelUrl ? [[customModelUrl, { fromTFHub: false }] as const] : MODEL_URLS;
    let model: Tf.GraphModel | undefined;
    let lastError: unknown;
    for (const [url, options] of candidates) {
      try {
        model = await tf.loadGraphModel(url, options);
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (!model) throw lastError instanceof Error ? lastError : new Error('model not found');
    const csv = await (await fetch(CLASS_MAP_URL)).text();
    const clapIds = parseClapClassIds(csv);
    if (clapIds.length === 0) throw new Error('class map has no Clapping class');
    return new YamnetClassifier(tf, model, clapIds);
  }

  async classify(samples16k: Float32Array): Promise<number> {
    const { tf, model, clapIds } = this;
    const scores = tf.tidy(() => {
      const out = model.predict(tf.tensor1d(samples16k)) as Tf.Tensor | Tf.Tensor[];
      return (Array.isArray(out) ? out[0] : out).max(0);
    });
    const values = await scores.data();
    scores.dispose();
    return Math.max(...clapIds.map((i) => values[i]));
  }
}
