import { describe, expect, it } from 'vitest';
import { CURRICULUM, nextTopicId } from '../lib/kobun/curriculum';

// 結果画面の「次の単元：〇〇 ▸」（2026-11-06。文法道場の見直し ①）
describe('次の単元を決める', () => {
  const all = CURRICULUM;

  it('並び順で今の単元の次を返す', () => {
    expect(nextTopicId('doushi-katsuyo', all)).toBe('doushi-yodan');
    expect(nextTopicId('onbin', all)).toBe('jodoshi-toha');
    expect(nextTopicId('kakari-musubi', all)).toBe('keigo');
  });
  it('本番にドリルが無い単元は飛ばして、その先の最初の単元へ進む', () => {
    expect(nextTopicId('doushi-katsuyo', ['doushi-katsuyo', 'doushi-sahen', 'keigo'])).toBe('doushi-sahen');
    expect(nextTopicId('doushi-sahen', ['doushi-katsuyo', 'doushi-sahen', 'keigo'])).toBe('keigo');
  });
  it('単語の単元（vocab-*）へは進めない＝文法の最後の単元の次は無い', () => {
    expect(nextTopicId('shikibetsu-shi', all)).toBeNull();
    expect(nextTopicId('vocab-kokon', all)).toBeNull();
  });
  it('並び順に無い単元・この先にドリルが1つも無いときは null', () => {
    expect(nextTopicId('unknown-topic', all)).toBeNull();
    expect(nextTopicId('keigo', ['keigo', 'doushi-katsuyo'])).toBeNull();
    expect(nextTopicId('keigo', [])).toBeNull();
  });
  it('次の単元は、必ず今の単元より後ろにある', () => {
    for (const id of all) {
      const n = nextTopicId(id, all);
      if (n) expect(all.indexOf(n)).toBeGreaterThan(all.indexOf(id));
    }
  });
});
