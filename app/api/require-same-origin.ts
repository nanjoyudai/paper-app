import { NextRequest, NextResponse } from "next/server";

// ブラウザからのクロスオリジンfetchにはOriginヘッダーが付与されるため、それが
// 自分自身のドメインと一致しない場合は拒否する。curlやサーバー間通信などOriginを
// 送らないリクエストは判定できないため許可する（強固なセキュリティ境界ではなく、
// 他サイトに埋め込まれてAPIキーの割り当てを消費されることへの簡易的な抑止策）。
export function requireSameOrigin(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  if (origin !== request.nextUrl.origin) {
    return NextResponse.json(
      { error: "このAPIはpaper-appの画面からのみ利用できます" },
      { status: 403 },
    );
  }

  return null;
}
