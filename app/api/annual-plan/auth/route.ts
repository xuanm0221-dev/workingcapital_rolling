import { NextRequest, NextResponse } from 'next/server';

// 간단한 PIN 검증 (실제 환경에서는 환경 변수 사용 권장)
const VALID_PIN = '1234'; // 기본 PIN

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pin } = body;
    
    if (!pin) {
      return NextResponse.json(
        { error: 'PIN을 입력해주세요.' },
        { status: 400 }
      );
    }
    
    // PIN 검증
    const isValid = pin === VALID_PIN;
    
    if (isValid) {
      return NextResponse.json({ 
        success: true,
        message: '인증되었습니다.' 
      });
    } else {
      return NextResponse.json(
        { error: 'PIN이 올바르지 않습니다.' },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error('PIN 인증 API 에러:', error);
    return NextResponse.json(
      { error: 'PIN 인증에 실패했습니다.' },
      { status: 500 }
    );
  }
}
