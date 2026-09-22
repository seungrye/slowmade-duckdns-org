// User 모델 단위 테스트 (Mongoose 스키마 검증).
//
// 실제 DB 연결 없이 스키마 정의만 본다.

import { describe, it, expect } from 'vitest';
import UserModel from './user';

describe('User 고유성 제약', () => {
  // #478 — username 에 unique 가 걸려 있어서, 이름이 같으면 뒤에 온 사람이 **아예 가입을
  // 못 했다**. auth.ts 의 signIn 콜백이 새 문서를 저장하다 E11000 으로 터지고 NextAuth 가
  // AccessDenied 를 냈다. 실제로 같은 이름의 다른 이메일로 로그인하다 막혔다.
  //
  // username 은 표시용 닉네임이다 — 이 이름으로 조회하거나 URL 식별자로 쓰는 코드가 없다.
  it('username 에는 unique 를 걸지 않는다 — 동명이인이 있을 수 있다', () => {
    expect(UserModel.schema.path('username').options.unique).toBeFalsy();
  });

  it('email 은 unique 다 — 계정 식별자는 이쪽이다', () => {
    expect(UserModel.schema.path('email').options.unique).toBe(true);
  });
});
