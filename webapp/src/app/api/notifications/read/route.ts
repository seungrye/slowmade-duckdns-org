// 알림 하나를 읽음 처리한다 (#247).
//
// 예전엔 `/notifications` 를 여는 것만으로 전부 읽음이 됐다(seen). 그래서 표식이 새로고침
// 한 번에 사라져, 무엇을 아직 처리 안 했는지 알 수 없었다. 이제 **항목을 눌러 그 덧글로
// 갈 때** 그것만 읽음으로 남긴다.
//
// 남의 알림을 건드릴 수 없다 — id 는 **자기 문서의 목록**에만 담기고, 안 읽음 판정은
// `notificationFilter` 가 이미 "내게 온 것"으로 한정한다. 남의 덧글 id 를 넣어 봐야
// 그 사람 목록에는 아무 영향이 없고, 자기 목록에서 걸릴 일도 없다.
import { NextResponse } from 'next/server';
import { apiSuccess, apiError } from '@/lib/api-response';
import { requireAuth } from '@/lib/require-auth';
import { connectToDB } from '@/lib/db';
import User from '@/models/user';
import { nextReadIds } from '@/lib/notification-read';

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  // 본문이 깨져 있어도 500 으로 터지지 않는다 — 알림 하나 때문에 에러 화면을 볼 이유가 없다.
  let id: unknown;
  try {
    ({ id } = await req.json());
  } catch {
    return apiError('잘못된 요청입니다.', 400);
  }
  if (typeof id !== 'string' || !id) return apiError('id 가 필요합니다.', 400);

  await connectToDB();

  // 상한을 지키려면 현재 목록을 알아야 해서 읽고 쓴다($addToSet 로는 상한을 못 건다).
  // 같은 사람이 동시에 두 개를 누르면 하나가 덮일 수 있는데, 다시 누르면 그만이라
  // 트랜잭션까지 갈 일이 아니다.
  const me = await User.findOne({ email: auth.email })
    .select('notificationsReadIds')
    .lean<{ notificationsReadIds?: string[] } | null>();

  const notificationsReadIds = nextReadIds(me?.notificationsReadIds ?? [], id);
  await User.updateOne({ email: auth.email }, { $set: { notificationsReadIds } });

  return apiSuccess({ readIds: notificationsReadIds.length });
}
