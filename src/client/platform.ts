// 플랫폼 연결부: 저장·사용자·판 시작/멈춤 신호·광고를 한 곳에 모은다.
// 화면 코드는 이 인터페이스만 부른다. 지금은 웹(localStorage) 구현만 있고,
// 크레이지게임스(SDK: data 모듈·user·game.gameplayStart/Stop·ad)·앱 구현은 나중에 같은 모양으로 끼운다.

export interface PlatformUser {
  id: string; // 플랫폼 안에서 고유한 id(웹: 기기 id)
  name: string;
  country?: string; // ISO 두 글자(크레이지게임스 systemInfo.countryCode)
  guest: boolean; // 크레이지게임스 손님 등: 기록은 보이되 서버에 남기지 않음
}

export interface Platform {
  readonly kind: 'web' | 'crazygames' | 'app';
  /** 저장(크레이지게임스는 계정에 이어지는 data 모듈) */
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  user(): PlatformUser;
  /** 실제 플레이가 시작·재개될 때 / 메뉴·멈춤·결과로 빠질 때 */
  gameplayStart(): void;
  gameplayStop(): void;
  /** 자연스러운 쉼(결과 → 다시 하기)에서 요청. 광고가 없거나 빈도 제한이면 바로 끝난다 */
  midgameAd(): Promise<void>;
  /** 보상형 광고: 끝까지 보면 true */
  readonly rewardedAvailable: boolean;
  rewardedAd(): Promise<boolean>;
  /** 새 기록 같은 기쁜 순간(크레이지게임스 happytime) */
  happyTime(): void;
}

class WebPlatform implements Platform {
  readonly kind = 'web' as const;
  readonly rewardedAvailable = false;
  private mem = new Map<string, string>(); // 저장이 막힌 환경(사생활 모드 등)의 대체
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return this.mem.get(key) ?? null;
    }
  }
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      this.mem.set(key, value);
    }
  }
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      this.mem.delete(key);
    }
  }
  user(): PlatformUser {
    let id = this.get('crawlution.device');
    if (!id) {
      id = 'd-' + Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
      this.set('crawlution.device', id);
    }
    return { id, name: '나', guest: false };
  }
  gameplayStart() {}
  gameplayStop() {}
  midgameAd() {
    return Promise.resolve();
  }
  rewardedAd() {
    return Promise.resolve(false);
  }
  happyTime() {}
}

export const platform: Platform = new WebPlatform();
