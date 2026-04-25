const SUPPORTED_LANGUAGES = ['ko', 'ja', 'en'];
const LANGUAGE_STORAGE_KEY = 'yurika_language';

const STATIC_TEXT_TRANSLATIONS = {
    en: {
        'Yurika Online 로딩 중...': 'Loading Yurika Online...',
        '업데이트 이력은 아래 버튼에서 확인할 수 있습니다.': 'You can check the update history with the button below.',
        '가방': 'Inventory',
        '스킬': 'Skills',
        '내 정보': 'Status',
        '친구': 'Friends',
        '설정': 'Settings',
        '전체화면': 'Fullscreen',
        '이모티콘': 'Emotes',
        '적대 대상 목록': 'Hostile Targets',
        '적대 대상 (PvP)': 'Hostile Targets (PvP)',
        '파티 목록': 'Party',
        '파티 탈퇴': 'Leave Party',
        '진행 중인 퀘스트': 'Active Quest',
        '활성 퀘스트 정보': 'Active quest information',
        '퀘스트를 진행해주세요.': 'Continue the quest.',
        '퀘스트 보상': 'Quest Reward',
        '유리카 지도': 'Yurika Map',
        '💬 채팅': '💬 Chat',
        '[자동]': '[Auto]',
        '유리카 온라인(Yurika Online)에 오신 것을 환영합니다!': 'Welcome to Yurika Online!',
        '메세지를 입력하세요...': 'Enter a message...',
        '메시지를 입력하세요.': 'Enter a message.',
        '다음 ▶': 'Next ▶',
        '가방 (Inventory)': 'Inventory',
        '아이템 이름': 'Item Name',
        '장착': 'Equip',
        '해제': 'Unequip',
        '강화': 'Upgrade',
        '축복 강화': 'Blessed Upgrade',
        '분해': 'Dismantle',
        '내 정보 (Status)': 'Status',
        'UID 조회': 'UID Lookup',
        '이름으로 UID 찾기': 'Find UID by Name',
        '플레이어 이름 검색': 'Search player name',
        '조회': 'Search',
        '이름:': 'Name:',
        '수정': 'Edit',
        '저장': 'Save',
        '직업:': 'Class:',
        '초보 마법사': 'Novice Mage',
        '레벨:': 'Level:',
        '다음 경험치': 'Next EXP',
        '보유 포인트': 'Points',
        '체력 (VIT)': 'Vitality (VIT)',
        '지능 (INT)': 'Intelligence (INT)',
        '지혜 (WIS)': 'Wisdom (WIS)',
        '순발력 (AGI)': 'Agility (AGI)',
        '현재 HP:': 'Current HP:',
        '현재 MP:': 'Current MP:',
        '공격력:': 'Attack:',
        '방어력:': 'Defense:',
        '체력 회복력:': 'HP Regen:',
        '마나 회복력:': 'MP Regen:',
        '공격속도:': 'Attack Speed:',
        '치명확률:': 'Crit Chance:',
        '이동속도:': 'Move Speed:',
        '계정 초기화': 'Reset Account',
        '캐릭터 초기화': 'Reset Character',
        '스킬 트리 (Skill Tree)': 'Skill Tree',
        '보유 마석:': 'Manastones:',
        '체인 라이트닝': 'Chain Lightning',
        '매직 미사일': 'Magic Missile',
        '파이어볼': 'Fireball',
        '앱솔루트 베리어': 'Absolute Barrier',
        '사운드': 'Sound',
        '마스터 볼륨': 'Master Volume',
        '일반 공격 소리': 'Basic Attack Sound',
        '전체 음소거': 'Mute All',
        '게임 플레이': 'Gameplay',
        '언어': 'Language',
        '한국어': 'Korean',
        '모바일 가로 자동 전체화면': 'Mobile Landscape Auto Fullscreen',
        '화면 회전 잠금': 'Orientation Lock',
        '전투 이펙트 절약 모드': 'Reduce Combat Effects',
        'PC 단축키 힌트 표시': 'Show PC Shortcut Hints',
        'HUD 표시': 'HUD Display',
        '채팅창 투명도': 'Chat Opacity',
        '친구창 투명도': 'Friends Opacity',
        '소형 채팅 투명도': 'Compact Chat Opacity',
        '퀘스트창 투명도': 'Quest Opacity',
        '미니맵 투명도': 'Minimap Opacity',
        '공격 UI 투명도': 'Action UI Opacity',
        '메뉴 묶음 투명도': 'Menu Group Opacity',
        '개발자 설정': 'Developer Settings',
        '현재 상태': 'Current Status',
        '개발자 모드 활성': 'Developer Mode Active',
        '프로필 사진을 다시 누르면 개발자 모드를 빠르게 켜거나 끌 수 있습니다.': 'Tap the profile portrait again to quickly toggle developer mode.',
        '로그 레벨': 'Log Level',
        '개발자 모드 종료': 'Exit Developer Mode',
        '권한 잠그기': 'Lock Permission',
        'UI 변경 모드': 'UI Layout Mode',
        '현재 화면 기준으로 버튼 위치와 크기를 조정합니다. 저장한 배치는 로그인할 때 계정 DB에서 불러와 자동 적용됩니다.': 'Adjust button positions and sizes for the current screen. Saved layouts are loaded from the account database at login.',
        'UI 변경 모드 시작': 'Start UI Layout Mode',
        '현재 화면 배치 초기화': 'Reset Current Layout',
        '버전 정보': 'Version Info',
        '현재 버전': 'Current Version',
        '업데이트 이력 보기': 'View Update History',
        '목록, 함께하기, 메시지, 선물을 한곳에서 관리합니다.': 'Manage list, join, messages, and gifts in one place.',
        '친구 추가': 'Add Friend',
        '친구 목록': 'Friend List',
        '친구를 선택하면 프로필과 대화 메뉴가 열립니다.': 'Select a friend to open profile and chat actions.',
        '이전 단계': 'Back',
        '친구 이름': 'Friend Name',
        '오프라인': 'Offline',
        '장착 무기': 'Equipped Weapon',
        '함께하기': 'Join',
        '메시지': 'Message',
        '선물': 'Gift',
        '삭제': 'Delete',
        '아이디 또는 이름으로 찾아서 친구 목록에 등록합니다.': 'Search by ID or name and add to your friend list.',
        '친구 추가 닫기': 'Close Add Friend',
        '아이디 또는 이름': 'ID or Name',
        '아이디 또는 이름 입력': 'Enter ID or name',
        '검색': 'Search',
        '친구를 찾으려면 아이디 또는 이름을 입력하세요.': 'Enter an ID or name to find a friend.',
        '채팅': 'Chat',
        '채팅 최소화': 'Minimize Chat',
        '채팅 닫기': 'Close Chat',
        '채팅 소형화': 'Compact Chat',
        '아이템 선택': 'Select Item',
        '접기': 'Collapse',
        '선물 보내기': 'Send Gift',
        '보낼 아이템 선택': 'Select Gift Item',
        '선물 아이템 선택 닫기': 'Close Gift Item Selection',
        '선물 수량 선택': 'Select Gift Quantity',
        '수량': 'Quantity',
        '취소': 'Cancel',
        '확인': 'OK',
        '전송': 'Send',
        '선물 열기': 'Open Gift',
        '투명': 'Transparent',
        '선명': 'Clear',
        '친구 프로필': 'Friend Profile',
        '채팅을 유지한 채 현재 상태와 장착 무기를 확인합니다.': 'Check status and equipped weapon while keeping the chat open.',
        '상단 바 드래그': 'Drag Top Bar',
        '현재 화면: 데스크톱': 'Current Screen: Desktop',
        '조정 대상': 'Target',
        '크기': 'Size',
        '조절할 패널이나 버튼을 직접 터치하거나 드래그해 위치를 바꾸고, 위 슬라이더로 크기를 조정하세요. 저장할 때만 계정 DB에 반영됩니다.': 'Touch or drag a panel or button to move it, then adjust size with the slider above. Changes are saved to the account database only when you save.',
        '선택 초기화': 'Reset Selection',
        '이 화면 초기화': 'Reset This Screen',
        '사망하셨습니다': 'You Died',
        '3초 후 부활 가능합니다...': 'You can revive in 3 seconds...',
        '재도전': 'Retry',
        '스텟을 저장하시겠습니까?': 'Save stat changes?',
        '한번 저장하면 변경할 수 없습니다.': 'Once saved, they cannot be changed.',
        '스킬 이름': 'Skill Name',
        '설명': 'Description',
        '스킬 상세': 'Skill Details',
        '현재 적용 공식과 수치': 'Current formula and values',
        '퀘스트 완료!': 'Quest Complete!',
        '보상을 획득했습니다.': 'Reward acquired.',
        '보상 받기': 'Claim Reward',
        '닫기': 'Close',
        '수락': 'Accept',
        '거절': 'Decline',
        '복구': 'Restore',
        '최소화': 'Minimize',
        '모바일 세로': 'Mobile Portrait',
        '모바일 가로': 'Mobile Landscape',
        '데스크톱': 'Desktop',
        '개발 오버레이': 'Dev Overlay',
        '프로필/HP 패널': 'Profile/HP Panel',
        '퀘스트창': 'Quest Panel',
        '채팅창': 'Chat Panel',
        '미니맵': 'Minimap',
        '메뉴 묶음': 'Menu Group',
        '조이스틱': 'Joystick',
        '스킬 U': 'Skill U',
        '스킬 K': 'Skill K',
        '스킬 H': 'Skill H',
        '기본 공격': 'Basic Attack',
        '오토 버튼': 'Auto Button',
        '지금 바로 부활할 수 있습니다!': 'You can revive now!',
        '전체 체력이 30 증가하고 방어력과 체력회복이 3 증가했습니다.': 'Max HP increased by 30, and defense and HP regen increased by 3.',
        '무기를 해제했습니다.': 'Weapon unequipped.',
        '분해할 무기를 선택해 주세요.': 'Select a weapon to dismantle.',
        '이 무기는 분해할 수 없습니다.': 'This weapon cannot be dismantled.',
        '강화할 무기가 없습니다.': 'No weapon available to upgrade.',
        '강화할 무기를 선택해 주세요.': 'Select a weapon to upgrade.',
        '해당 무기는 이미 최종 강화된 상태입니다.': 'This weapon is already at maximum upgrade.',
        '이 장비는 더 이상 강화할 수 없습니다.': 'This equipment cannot be upgraded further.',
        '함께하기를 종료하시겠습니까?': 'Stop joining this friend?',
        '게임을 종료하시겠습니까?': 'Exit the game?',
        '현재 적대 중인 대상이 없습니다.': 'There are no current hostile targets.',
        '해당 유저를 찾을 수 없습니다.': 'User not found.',
        '자기 자신을 적대할 수 없습니다.': 'You cannot mark yourself hostile.',
        '올바른 닉네임을 입력해주세요.': 'Enter a valid nickname.',
        '오류가 발생했습니다.': 'An error occurred.',
        '이미 같은 파티에 있는 유저입니다.': 'This user is already in your party.',
        '자기 자신을 초대할 수 없습니다.': 'You cannot invite yourself.',
        '사용자를 찾을 수 없습니다': 'User not found',
        '친구 추가 중 오류가 발생했습니다.': 'An error occurred while adding the friend.',
        '처리할 수 없습니다.': 'Unable to process.',
        '메시지 전송 중 오류가 발생했습니다.': 'An error occurred while sending the message.',
        '선물 기능은 다음 단계에서 연결할 예정입니다. 이번 변경에서는 친구/함께하기 흐름을 우선 정리했습니다.': 'Gift features will be connected in the next phase. This update focuses on friends and join flow.',
        '함께하기 요청이 수락되지 않았습니다.': 'The join request was not accepted.',
        '자기 자신은 친구 목록에 추가할 수 없습니다.': 'You cannot add yourself as a friend.',
        '선물 전송 중 오류가 발생했습니다.': 'An error occurred while sending the gift.',
        '선물 수령 중 오류가 발생했습니다.': 'An error occurred while receiving the gift.',
        '이름을 입력해 주세요.': 'Enter a name.',
        '조회 중입니다...': 'Searching...',
        '대상을 찾지 못했습니다.': 'Target not found.',
        '조회 중...': 'Searching...',
        '찾을 수 없음': 'Not found',
        '캐릭터가 삭제되었습니다. 페이지를 새로고침합니다.': 'Character deleted. Reloading the page.',
        '캐릭터 삭제에 실패했습니다.': 'Failed to delete character.',
        '바람 언덕 (Starting Field)': 'Wind Hill',
        '달샘 마을 (Moonwell Town)': 'Moonwell Town',
        '어둠숲 (Dark Forest)': 'Dark Forest',
        '랜턴 숲 던전 (Lantern Woods)': 'Lantern Woods Dungeon',
        '달샘 마을로 가는 언덕길': 'Hill Road to Moonwell Town',
        '바람 언덕으로 돌아가는 길': 'Road Back to Wind Hill',
        '어둠숲으로 향하는 동쪽 문': 'East Gate to Dark Forest',
        '달샘 마을로 돌아가는 숲길': 'Forest Path Back to Moonwell Town',
        '랜턴 숲 던전 입구': 'Lantern Woods Dungeon Entrance',
        '어둠숲으로 나가는 던전 입구': 'Dungeon Exit to Dark Forest',
        '다음 지역': 'Next Area'
    },
    ja: {
        'Yurika Online 로딩 중...': 'Yurika Online 読み込み中...',
        '업데이트 이력은 아래 버튼에서 확인할 수 있습니다.': '更新履歴は下のボタンから確認できます。',
        '가방': 'バッグ',
        '스킬': 'スキル',
        '내 정보': 'ステータス',
        '친구': 'フレンド',
        '설정': '設定',
        '전체화면': '全画面',
        '이모티콘': 'エモート',
        '적대 대상 목록': '敵対対象一覧',
        '적대 대상 (PvP)': '敵対対象 (PvP)',
        '파티 목록': 'パーティ',
        '파티 탈퇴': 'パーティ脱退',
        '진행 중인 퀘스트': '進行中のクエスト',
        '활성 퀘스트 정보': 'アクティブクエスト情報',
        '퀘스트를 진행해주세요.': 'クエストを進めてください。',
        '퀘스트 보상': 'クエスト報酬',
        '유리카 지도': 'ユリカ地図',
        '💬 채팅': '💬 チャット',
        '[자동]': '[自動]',
        '유리카 온라인(Yurika Online)에 오신 것을 환영합니다!': 'Yurika Onlineへようこそ!',
        '메세지를 입력하세요...': 'メッセージを入力...',
        '메시지를 입력하세요.': 'メッセージを入力してください。',
        '다음 ▶': '次へ ▶',
        '가방 (Inventory)': 'バッグ',
        '아이템 이름': 'アイテム名',
        '장착': '装備',
        '해제': '解除',
        '강화': '強化',
        '축복 강화': '祝福強化',
        '분해': '分解',
        '내 정보 (Status)': 'ステータス',
        'UID 조회': 'UID検索',
        '이름으로 UID 찾기': '名前でUIDを探す',
        '플레이어 이름 검색': 'プレイヤー名を検索',
        '조회': '検索',
        '이름:': '名前:',
        '수정': '編集',
        '저장': '保存',
        '직업:': '職業:',
        '초보 마법사': '見習い魔法使い',
        '레벨:': 'レベル:',
        '다음 경험치': '次の経験値',
        '보유 포인트': '所持ポイント',
        '체력 (VIT)': '体力 (VIT)',
        '지능 (INT)': '知能 (INT)',
        '지혜 (WIS)': '知恵 (WIS)',
        '순발력 (AGI)': '俊敏 (AGI)',
        '현재 HP:': '現在HP:',
        '현재 MP:': '現在MP:',
        '공격력:': '攻撃力:',
        '방어력:': '防御力:',
        '체력 회복력:': 'HP回復力:',
        '마나 회복력:': 'MP回復力:',
        '공격속도:': '攻撃速度:',
        '치명확률:': '会心率:',
        '이동속도:': '移動速度:',
        '계정 초기화': 'アカウント初期化',
        '캐릭터 초기화': 'キャラクター初期化',
        '스킬 트리 (Skill Tree)': 'スキルツリー',
        '보유 마석:': '所持魔石:',
        '체인 라이트닝': 'チェインライトニング',
        '매직 미사일': 'マジックミサイル',
        '파이어볼': 'ファイアボール',
        '앱솔루트 베리어': 'アブソリュートバリア',
        '사운드': 'サウンド',
        '마스터 볼륨': 'マスター音量',
        '일반 공격 소리': '通常攻撃音',
        '전체 음소거': '全体ミュート',
        '게임 플레이': 'ゲームプレイ',
        '언어': '言語',
        '한국어': '韓国語',
        '모바일 가로 자동 전체화면': 'モバイル横向き自動全画面',
        '화면 회전 잠금': '画面回転ロック',
        '전투 이펙트 절약 모드': '戦闘エフェクト軽量化',
        'PC 단축키 힌트 표시': 'PCショートカット表示',
        'HUD 표시': 'HUD表示',
        '채팅창 투명도': 'チャット透明度',
        '친구창 투명도': 'フレンド透明度',
        '소형 채팅 투명도': '小型チャット透明度',
        '퀘스트창 투명도': 'クエスト透明度',
        '미니맵 투명도': 'ミニマップ透明度',
        '공격 UI 투명도': '攻撃UI透明度',
        '메뉴 묶음 투명도': 'メニュー透明度',
        '개발자 설정': '開発者設定',
        '현재 상태': '現在状態',
        '개발자 모드 활성': '開発者モード有効',
        '프로필 사진을 다시 누르면 개발자 모드를 빠르게 켜거나 끌 수 있습니다.': 'プロフィール画像をもう一度押すと開発者モードを切り替えられます。',
        '로그 레벨': 'ログレベル',
        '개발자 모드 종료': '開発者モード終了',
        '권한 잠그기': '権限ロック',
        'UI 변경 모드': 'UI編集モード',
        '현재 화면 기준으로 버튼 위치와 크기를 조정합니다. 저장한 배치는 로그인할 때 계정 DB에서 불러와 자동 적용됩니다.': '現在の画面に合わせてボタン位置とサイズを調整します。保存した配置はログイン時にアカウントDBから読み込まれます。',
        'UI 변경 모드 시작': 'UI編集モード開始',
        '현재 화면 배치 초기화': '現在画面の配置を初期化',
        '버전 정보': 'バージョン情報',
        '현재 버전': '現在バージョン',
        '업데이트 이력 보기': '更新履歴を見る',
        '목록, 함께하기, 메시지, 선물을 한곳에서 관리합니다.': '一覧、合流、メッセージ、ギフトをまとめて管理します。',
        '친구 추가': 'フレンド追加',
        '친구 목록': 'フレンド一覧',
        '친구를 선택하면 프로필과 대화 메뉴가 열립니다.': 'フレンドを選ぶとプロフィールと会話メニューが開きます。',
        '이전 단계': '戻る',
        '친구 이름': 'フレンド名',
        '오프라인': 'オフライン',
        '장착 무기': '装備武器',
        '함께하기': '合流',
        '메시지': 'メッセージ',
        '선물': 'ギフト',
        '삭제': '削除',
        '아이디 또는 이름으로 찾아서 친구 목록에 등록합니다.': 'IDまたは名前で検索してフレンド一覧に登録します。',
        '친구 추가 닫기': 'フレンド追加を閉じる',
        '아이디 또는 이름': 'IDまたは名前',
        '아이디 또는 이름 입력': 'IDまたは名前を入力',
        '검색': '検索',
        '친구를 찾으려면 아이디 또는 이름을 입력하세요.': 'フレンドを探すにはIDまたは名前を入力してください。',
        '채팅': 'チャット',
        '채팅 최소화': 'チャット最小化',
        '채팅 닫기': 'チャットを閉じる',
        '채팅 소형화': '小型チャット',
        '아이템 선택': 'アイテム選択',
        '접기': '閉じる',
        '선물 보내기': 'ギフト送信',
        '보낼 아이템 선택': '送るアイテムを選択',
        '선물 아이템 선택 닫기': 'ギフトアイテム選択を閉じる',
        '선물 수량 선택': 'ギフト数量選択',
        '수량': '数量',
        '취소': 'キャンセル',
        '확인': '確認',
        '전송': '送信',
        '선물 열기': 'ギフトを開く',
        '투명': '透明',
        '선명': '鮮明',
        '친구 프로필': 'フレンドプロフィール',
        '채팅을 유지한 채 현재 상태와 장착 무기를 확인합니다.': 'チャットを維持したまま現在状態と装備武器を確認します。',
        '상단 바 드래그': '上部バーをドラッグ',
        '현재 화면: 데스크톱': '現在画面: デスクトップ',
        '조정 대상': '調整対象',
        '크기': 'サイズ',
        '조절할 패널이나 버튼을 직접 터치하거나 드래그해 위치를 바꾸고, 위 슬라이더로 크기를 조정하세요. 저장할 때만 계정 DB에 반영됩니다.': '調整するパネルやボタンを直接タッチまたはドラッグして位置を変え、上のスライダーでサイズを調整してください。保存時のみアカウントDBに反映されます。',
        '선택 초기화': '選択を初期化',
        '이 화면 초기화': 'この画面を初期化',
        '사망하셨습니다': '倒れました',
        '3초 후 부활 가능합니다...': '3秒後に復活できます...',
        '재도전': '再挑戦',
        '스텟을 저장하시겠습니까?': 'ステータスを保存しますか?',
        '한번 저장하면 변경할 수 없습니다.': '一度保存すると変更できません。',
        '스킬 이름': 'スキル名',
        '설명': '説明',
        '스킬 상세': 'スキル詳細',
        '현재 적용 공식과 수치': '現在適用中の式と数値',
        '퀘스트 완료!': 'クエスト完了!',
        '보상을 획득했습니다.': '報酬を獲得しました。',
        '보상 받기': '報酬を受け取る',
        '닫기': '閉じる',
        '수락': '承諾',
        '거절': '拒否',
        '복구': '復旧',
        '최소화': '最小化',
        '모바일 세로': 'モバイル縦',
        '모바일 가로': 'モバイル横',
        '데스크톱': 'デスクトップ',
        '개발 오버레이': '開発オーバーレイ',
        '프로필/HP 패널': 'プロフィール/HPパネル',
        '퀘스트창': 'クエストパネル',
        '채팅창': 'チャットパネル',
        '미니맵': 'ミニマップ',
        '메뉴 묶음': 'メニューグループ',
        '조이스틱': 'ジョイスティック',
        '스킬 U': 'スキル U',
        '스킬 K': 'スキル K',
        '스킬 H': 'スキル H',
        '기본 공격': '通常攻撃',
        '오토 버튼': 'オートボタン',
        '지금 바로 부활할 수 있습니다!': '今すぐ復活できます!',
        '전체 체력이 30 증가하고 방어력과 체력회복이 3 증가했습니다.': '最大HPが30、防御力とHP回復が3増加しました。',
        '무기를 해제했습니다.': '武器を外しました。',
        '분해할 무기를 선택해 주세요.': '分解する武器を選んでください。',
        '이 무기는 분해할 수 없습니다.': 'この武器は分解できません。',
        '강화할 무기가 없습니다.': '強化できる武器がありません。',
        '강화할 무기를 선택해 주세요.': '強化する武器を選んでください。',
        '해당 무기는 이미 최종 강화된 상태입니다.': 'この武器はすでに最大強化です。',
        '이 장비는 더 이상 강화할 수 없습니다.': 'この装備はこれ以上強化できません。',
        '함께하기를 종료하시겠습니까?': '合流を終了しますか?',
        '게임을 종료하시겠습니까?': 'ゲームを終了しますか?',
        '현재 적대 중인 대상이 없습니다.': '現在敵対中の対象はいません。',
        '해당 유저를 찾을 수 없습니다.': 'ユーザーが見つかりません。',
        '자기 자신을 적대할 수 없습니다.': '自分自身を敵対対象にできません。',
        '올바른 닉네임을 입력해주세요.': '正しいニックネームを入力してください。',
        '오류가 발생했습니다.': 'エラーが発生しました。',
        '이미 같은 파티에 있는 유저입니다.': 'すでに同じパーティのユーザーです。',
        '자기 자신을 초대할 수 없습니다.': '自分自身は招待できません。',
        '사용자를 찾을 수 없습니다': 'ユーザーが見つかりません',
        '친구 추가 중 오류가 발생했습니다.': 'フレンド追加中にエラーが発生しました。',
        '처리할 수 없습니다.': '処理できません。',
        '메시지 전송 중 오류가 발생했습니다.': 'メッセージ送信中にエラーが発生しました。',
        '선물 기능은 다음 단계에서 연결할 예정입니다. 이번 변경에서는 친구/함께하기 흐름을 우선 정리했습니다.': 'ギフト機能は次の段階で接続予定です。今回の変更ではフレンド/合流の流れを優先しました。',
        '함께하기 요청이 수락되지 않았습니다.': '合流リクエストが承諾されませんでした。',
        '자기 자신은 친구 목록에 추가할 수 없습니다.': '自分自身をフレンドに追加できません。',
        '선물 전송 중 오류가 발생했습니다.': 'ギフト送信中にエラーが発生しました。',
        '선물 수령 중 오류가 발생했습니다.': 'ギフト受領中にエラーが発生しました。',
        '이름을 입력해 주세요.': '名前を入力してください。',
        '조회 중입니다...': '検索中...',
        '대상을 찾지 못했습니다.': '対象が見つかりません。',
        '조회 중...': '検索中...',
        '찾을 수 없음': '見つかりません',
        '캐릭터가 삭제되었습니다. 페이지를 새로고침합니다.': 'キャラクターを削除しました。ページを再読み込みします。',
        '캐릭터 삭제에 실패했습니다.': 'キャラクター削除に失敗しました。',
        '바람 언덕 (Starting Field)': '風の丘',
        '달샘 마을 (Moonwell Town)': '月泉の村',
        '어둠숲 (Dark Forest)': '闇の森',
        '랜턴 숲 던전 (Lantern Woods)': 'ランタンの森ダンジョン',
        '달샘 마을로 가는 언덕길': '月泉の村へ続く丘道',
        '바람 언덕으로 돌아가는 길': '風の丘へ戻る道',
        '어둠숲으로 향하는 동쪽 문': '闇の森へ向かう東門',
        '달샘 마을로 돌아가는 숲길': '月泉の村へ戻る森道',
        '랜턴 숲 던전 입구': 'ランタンの森ダンジョン入口',
        '어둠숲으로 나가는 던전 입구': '闇の森へ出るダンジョン入口',
        '다음 지역': '次の地域'
    }
};

const TRANSLATABLE_ATTRIBUTES = ['title', 'aria-label', 'placeholder'];
const SKIP_TRANSLATION_SELECTOR = [
    'script',
    'style',
    'noscript',
    'canvas',
    'input',
    'textarea',
    '[contenteditable="true"]',
    '[data-no-translate]',
    '.no-translate',
    '#player-name-display'
].join(', ');
const DYNAMIC_TRANSLATION_SKIP_SELECTOR = [
    '[data-no-translate]',
    '.no-translate',
    '.chat-messages',
    '.friend-chat-log',
    '#dialog-text',
    '#dialog-name',
    '#player-name-display',
    '.char-name',
    '.player-name'
].join(', ');

const TRANSLATIONS = {
    ko: {
        'language.ko': '한국어',
        'language.ja': '日本語',
        'language.en': 'English',

        'opening.kicker': '어두운 숲의 오두막',
        'opening.title': 'YURIKA ONLINE',
        'opening.subtitle': '마석이 깨어나는 밤',
        'opening.prompt': '설정을 마친 뒤 시작하기 버튼을 눌러 계속',
        'opening.start': '시작하기',
        'opening.settings': '설정',
        'opening.language': '언어',
        'opening.sound': '사운드',
        'opening.masterVolume': '마스터 볼륨',
        'opening.muted': '전체 음소거',
        'opening.reducedEffects': '전투 이펙트 절약',
        'opening.autoFullscreen': '모바일 가로 전체화면',
        'opening.orientationLock': '화면 회전 잠금',
        'opening.oath': '오늘 밤, 지켜야 할 이름이 있다.',
        'opening.settingsHint': '선택한 언어와 설정은 게임 전체에 저장됩니다.',

        'login.kicker': '어두운 숲의 오두막',
        'login.subtitle': '마석이 깨어나는 밤',
        'login.lore': '딸을 지키려는 아버지의 불빛이 아직 꺼지지 않았습니다. 문틈 너머로 새어 나오는 푸른 마석의 숨결을 따라 접속하세요.',
        'login.oath.boundary': '숲의 경계',
        'login.oath.cabin': '오두막의 불빛',
        'login.oath.promise': '보호자의 맹세',
        'login.continue': '계정으로 이어가기',
        'login.google': 'Google로 로그인',
        'login.guest': '게스트로 시작하기',
        'login.hint': '첫 접속 후 캐릭터 이름을 정하면 오두막 앞에서 시작합니다.',
        'login.googleLoading': '구글 로그인 중...',
        'login.error': '로그인 중 오류가 발생했습니다: {message}',
        'login.unauthorizedDomain': '승인되지 않은 도메인입니다 ({host}). Firebase 콘솔에서 승인된 도메인에 추가해주세요.',

        'char.create.kicker': '오두막 방어',
        'char.create.title': '캐릭터 생성',
        'char.create.desc': '기본 플레이어블은 유리카를 지키는 아빠입니다. 테스트용으로 유리카도 선택할 수 있습니다.',
        'char.create.placeholder': '이름 (복구 시 ##UID 입력)',
        'char.create.preview': '마석등의 빛',
        'char.create.button': '캐릭터 생성',
        'char.create.cancel': '취소',
        'char.select.kicker': '플레이어블 선택',
        'char.select.title': '캐릭터 선택',
        'char.select.desc': '아빠로 유리카를 지키는 흐름이 기본입니다. 테스트할 캐릭터를 고르세요.',
        'char.select.level': 'Lv.{level} 메이지 ({expRate}%)',
        'char.select.manastone': '마석 {amount}',
        'char.select.origin': '오두막 시작',
        'char.select.start': '게임 시작',
        'char.select.logout': '로그아웃',
        'char.defaultName': '아빠',
        'char.character.select': '플레이 캐릭터',
        'char.character.father.name': '아빠',
        'char.character.father.role': '기본 플레이어블 · 유리카를 지키는 마법사',
        'char.character.yurika.name': '유리카',
        'char.character.yurika.role': '테스트 플레이어블 · 딸 캐릭터 확인용',
        'char.status.nameTooShort': '이름은 2자 이상이어야 합니다.',
        'char.status.checkingDuplicate': '이름 중복 확인 중...',
        'char.status.invalidUid': '올바른 UID를 입력해주세요.',
        'char.status.findingUid': 'UID로 계정 데이터를 찾는 중...',
        'char.status.recoveryPrompt': '기존 계정({name}, Lv.{level}) 데이터를 발견했습니다!\n현재 계정으로 복구하시겠습니까?',
        'char.status.recoveryBlocked': '복구 대상이 현재 계정보다 오래된 데이터라 복구를 막았습니다.',
        'char.status.recoveryError': '복구 중 오류가 발생했습니다.',
        'char.status.recoveryDone': '복구 완료! 잠시만 기다려주세요...',
        'char.status.uidMissing': '존재하지 않는 UID 데이터입니다.',
        'char.status.nameTooLong': '이름은 최대 8자까지만 가능합니다.',
        'char.status.duplicateName': '이미 존재하는 이름입니다.',
        'char.status.createDone': '캐릭터 생성 완료!',
        'char.status.createError': '생성 처리 중 오류가 발생했습니다.',
        'char.reset.confirm': '레벨을 제외한 마석/스텟/스킬이 초기화됩니다.\n사용된 마석/스텟은 반환됩니다.\n\n계속하시겠습니까?',
        'char.reset.done': '초기화 완료!\n반환된 스텟: {stats}\n반환된 마석: {manastone}',

        'settings.title': '설정',
        'settings.sound': '사운드',
        'settings.masterVolume': '마스터 볼륨',
        'settings.basicAttackSound': '일반 공격 소리',
        'settings.muted': '전체 음소거',
        'settings.gameplay': '게임 플레이',
        'settings.language': '언어',
        'settings.autoFullscreen': '모바일 가로 자동 전체화면',
        'settings.orientationLock': '화면 회전 잠금',
        'settings.reducedEffects': '전투 이펙트 절약 모드',
        'settings.shortcutHints': 'PC 단축키 힌트 표시',
        'settings.close': '닫기',

        'quest.tutorialTitle': '튜토리얼 · {title}',
        'quest.guideRewardTitle': '진행 안내',
        'quest.tutorialProgress': '단계 {step}/{total} · 진행도 {current}/{target}',
        'quest.tutorialAfter': '단계 {step}/{total} · 튜토리얼 완료 후 슬라임 퀘스트가 시작됩니다.',
        'quest.progress': '진행도: {current}/{target}',
        'quest.claimTitle': '보상 수령하기!',
        'quest.rewardTitle': '퀘스트 보상',
        'quest.claimDesktop': '클릭 또는 Q로 {reward} 획득',
        'quest.claimTouch': '클릭하여 {reward} 획득',
        'quest.slime10.title': '1. 슬라임 10마리 처치',
        'quest.slime10.reward': '지혜 스탯 +2',
        'quest.slime30.title': '2. 슬라임 30마리 처치 (강림)',
        'quest.slime30.reward': '체력 스탯 +3, 대왕 슬라임 소환',
        'quest.king.title': '3. 대왕 슬라임 처치',
        'quest.king.reward': '축복받은 무기 강화석 x3',
        'quest.repeatBoss.title': '5. 대왕 슬라임 처치 (반복)',
        'quest.repeatBoss.reward': '축복받은 무기 강화석 x1',
        'quest.repeatSlime.title': '4. 슬라임 50마리 처치 (소환)',
        'quest.repeatSlime.reward': '대왕 슬라임 소환',

        'ui.autoAttackToggle': '[자동]',
        'ui.autoAttackEnabled': '자동 일반공격 활성화',
        'ui.autoAttackDisabled': '자동 일반공격 비활성화',

        'system.prologueCompleted': '프롤로그를 완료했습니다. 오두막 주변의 이상 징후를 조사하세요.',
        'system.questStart': '기초 훈련을 마치면 첫 슬라임 퀘스트가 열립니다.',
        'system.tutorialCompleted': '튜토리얼 완료: {title}',
        'system.tutorialEnd': '튜토리얼이 끝났습니다. 이제 슬라임 사냥을 시작해 보세요.',
        'system.questAvailable': '퀘스트 완료 가능: {title}',
        'system.zoneEnter': '{name}',
        'system.transitionKicker': '이동 중',
        'system.portalMoving': '{label} 이동 중...',
        'system.languageChanged': '언어가 한국어로 변경되었습니다.'
    },
    ja: {
        'language.ko': '韓国語',
        'language.ja': '日本語',
        'language.en': '英語',

        'opening.kicker': '暗い森の小屋',
        'opening.title': 'YURIKA ONLINE',
        'opening.subtitle': '魔石が目覚める夜',
        'opening.prompt': '設定後、開始ボタンで続行',
        'opening.start': 'はじめる',
        'opening.settings': '設定',
        'opening.language': '言語',
        'opening.sound': 'サウンド',
        'opening.masterVolume': 'マスター音量',
        'opening.muted': '全体ミュート',
        'opening.reducedEffects': '戦闘エフェクト軽量化',
        'opening.autoFullscreen': 'モバイル横向き全画面',
        'opening.orientationLock': '画面回転ロック',
        'opening.oath': '今夜、守らなければならない名前がある。',
        'opening.settingsHint': '選択した言語と設定はゲーム全体に保存されます。',

        'login.kicker': '暗い森の小屋',
        'login.subtitle': '魔石が目覚める夜',
        'login.lore': '娘を守ろうとする父の灯は、まだ消えていません。扉の隙間から漏れる青い魔石の息吹をたどって接続してください。',
        'login.oath.boundary': '森の境界',
        'login.oath.cabin': '小屋の灯',
        'login.oath.promise': '守護者の誓い',
        'login.continue': 'アカウントで続ける',
        'login.google': 'Googleでログイン',
        'login.guest': 'ゲストではじめる',
        'login.hint': '初回接続後に名前を決めると、小屋の前から始まります。',
        'login.googleLoading': 'Googleログイン中...',
        'login.error': 'ログイン中にエラーが発生しました: {message}',
        'login.unauthorizedDomain': '承認されていないドメインです ({host})。Firebaseコンソールで承認済みドメインに追加してください。',

        'char.create.kicker': '小屋の防衛',
        'char.create.title': 'キャラクター作成',
        'char.create.desc': '基本のプレイアブルは、ユリカを守る父です。テスト用にユリカも選べます。',
        'char.create.placeholder': '名前 (復旧時は ##UID)',
        'char.create.preview': '魔石灯の光',
        'char.create.button': '作成する',
        'char.create.cancel': 'キャンセル',
        'char.select.kicker': 'プレイアブル選択',
        'char.select.title': 'キャラクター選択',
        'char.select.desc': '父でユリカを守る流れが基本です。テストするキャラクターを選んでください。',
        'char.select.level': 'Lv.{level} メイジ ({expRate}%)',
        'char.select.manastone': '魔石 {amount}',
        'char.select.origin': '小屋から開始',
        'char.select.start': 'ゲーム開始',
        'char.select.logout': 'ログアウト',
        'char.defaultName': '父',
        'char.character.select': 'プレイキャラクター',
        'char.character.father.name': '父',
        'char.character.father.role': '基本プレイアブル · ユリカを守る魔法使い',
        'char.character.yurika.name': 'ユリカ',
        'char.character.yurika.role': 'テスト用プレイアブル · 娘キャラクター確認用',
        'char.status.nameTooShort': '名前は2文字以上にしてください。',
        'char.status.checkingDuplicate': '名前の重複を確認中...',
        'char.status.invalidUid': '正しいUIDを入力してください。',
        'char.status.findingUid': 'UIDでアカウントデータを検索中...',
        'char.status.recoveryPrompt': '既存アカウント({name}, Lv.{level})のデータを発見しました!\n現在のアカウントへ復旧しますか?',
        'char.status.recoveryBlocked': '復旧対象が現在のアカウントより古いため、復旧を止めました。',
        'char.status.recoveryError': '復旧中にエラーが発生しました。',
        'char.status.recoveryDone': '復旧完了! 少しお待ちください...',
        'char.status.uidMissing': '存在しないUIDデータです。',
        'char.status.nameTooLong': '名前は最大8文字までです。',
        'char.status.duplicateName': 'すでに存在する名前です。',
        'char.status.createDone': 'キャラクター作成完了!',
        'char.status.createError': '作成処理中にエラーが発生しました。',
        'char.reset.confirm': 'レベルを除く魔石/ステータス/スキルが初期化されます。\n使用した魔石/ステータスは返還されます。\n\n続行しますか?',
        'char.reset.done': '初期化完了!\n返還ステータス: {stats}\n返還魔石: {manastone}',

        'settings.title': '設定',
        'settings.sound': 'サウンド',
        'settings.masterVolume': 'マスター音量',
        'settings.basicAttackSound': '通常攻撃音',
        'settings.muted': '全体ミュート',
        'settings.gameplay': 'ゲームプレイ',
        'settings.language': '言語',
        'settings.autoFullscreen': 'モバイル横向き自動全画面',
        'settings.orientationLock': '画面回転ロック',
        'settings.reducedEffects': '戦闘エフェクト軽量化',
        'settings.shortcutHints': 'PCショートカット表示',
        'settings.close': '閉じる',

        'quest.tutorialTitle': 'チュートリアル · {title}',
        'quest.guideRewardTitle': '進行ガイド',
        'quest.tutorialProgress': '段階 {step}/{total} · 進行度 {current}/{target}',
        'quest.tutorialAfter': '段階 {step}/{total} · 完了後、スライムクエストが始まります。',
        'quest.progress': '進行度: {current}/{target}',
        'quest.claimTitle': '報酬を受け取る!',
        'quest.rewardTitle': 'クエスト報酬',
        'quest.claimDesktop': 'クリックまたはQで {reward} 獲得',
        'quest.claimTouch': 'クリックして {reward} 獲得',
        'quest.slime10.title': '1. スライムを10体討伐',
        'quest.slime10.reward': '知恵ステータス +2',
        'quest.slime30.title': '2. スライムを30体討伐 (降臨)',
        'quest.slime30.reward': '体力ステータス +3、キングスライム召喚',
        'quest.king.title': '3. キングスライム討伐',
        'quest.king.reward': '祝福された武器強化石 x3',
        'quest.repeatBoss.title': '5. キングスライム討伐 (反復)',
        'quest.repeatBoss.reward': '祝福された武器強化石 x1',
        'quest.repeatSlime.title': '4. スライムを50体討伐 (召喚)',
        'quest.repeatSlime.reward': 'キングスライム召喚',

        'ui.autoAttackToggle': '[自動]',
        'ui.autoAttackEnabled': '通常攻撃の自動化オン',
        'ui.autoAttackDisabled': '通常攻撃の自動化オフ',

        'system.prologueCompleted': 'プロローグを完了しました。小屋の周辺の異変を調べましょう。',
        'system.questStart': '基礎訓練を終えると、最初のスライムクエストが開放されます。',
        'system.tutorialCompleted': 'チュートリアル完了: {title}',
        'system.tutorialEnd': 'チュートリアルが終わりました。スライム狩りを始めましょう。',
        'system.questAvailable': '完了可能なクエスト: {title}',
        'system.zoneEnter': '{name}',
        'system.transitionKicker': '移動中',
        'system.portalMoving': '{label}へ移動中...',
        'system.languageChanged': '言語が日本語に変更されました。'
    },
    en: {
        'language.ko': 'Korean',
        'language.ja': 'Japanese',
        'language.en': 'English',

        'opening.kicker': 'The Cabin in the Dark Forest',
        'opening.title': 'YURIKA ONLINE',
        'opening.subtitle': 'The night the manastone awakens',
        'opening.prompt': 'Adjust settings, then press Start to continue',
        'opening.start': 'Start',
        'opening.settings': 'Settings',
        'opening.language': 'Language',
        'opening.sound': 'Sound',
        'opening.masterVolume': 'Master volume',
        'opening.muted': 'Mute all',
        'opening.reducedEffects': 'Reduce combat effects',
        'opening.autoFullscreen': 'Mobile landscape fullscreen',
        'opening.orientationLock': 'Orientation lock',
        'opening.oath': 'Tonight, there is a name you must protect.',
        'opening.settingsHint': 'Your language and settings are saved across the game.',

        'login.kicker': 'The Cabin in the Dark Forest',
        'login.subtitle': 'The night the manastone awakens',
        'login.lore': 'The light of a father protecting his daughter has not gone out. Follow the blue breath of the manastone seeping through the door.',
        'login.oath.boundary': 'Forest border',
        'login.oath.cabin': 'Cabin light',
        'login.oath.promise': 'Guardian oath',
        'login.continue': 'Continue with account',
        'login.google': 'Sign in with Google',
        'login.guest': 'Start as guest',
        'login.hint': 'After your first login, choose a name and begin in front of the cabin.',
        'login.googleLoading': 'Signing in with Google...',
        'login.error': 'Login failed: {message}',
        'login.unauthorizedDomain': 'Unauthorized domain ({host}). Add it to authorized domains in Firebase Console.',

        'char.create.kicker': 'Cabin defense',
        'char.create.title': 'Create Character',
        'char.create.desc': 'The default playable character is Yurika’s father. Yurika is available for testing.',
        'char.create.placeholder': 'Name (use ##UID to recover)',
        'char.create.preview': 'Manastone lamp light',
        'char.create.button': 'Create Character',
        'char.create.cancel': 'Cancel',
        'char.select.kicker': 'Playable Select',
        'char.select.title': 'Select Character',
        'char.select.desc': 'The main flow is the father protecting Yurika. Choose a character for this test run.',
        'char.select.level': 'Lv.{level} Mage ({expRate}%)',
        'char.select.manastone': 'Manastone {amount}',
        'char.select.origin': 'Cabin start',
        'char.select.start': 'Start Game',
        'char.select.logout': 'Log out',
        'char.defaultName': 'Father',
        'char.character.select': 'Playable character',
        'char.character.father.name': 'Father',
        'char.character.father.role': 'Default playable · mage guarding Yurika',
        'char.character.yurika.name': 'Yurika',
        'char.character.yurika.role': 'Test playable · daughter character check',
        'char.status.nameTooShort': 'Name must be at least 2 characters.',
        'char.status.checkingDuplicate': 'Checking name availability...',
        'char.status.invalidUid': 'Please enter a valid UID.',
        'char.status.findingUid': 'Searching account data by UID...',
        'char.status.recoveryPrompt': 'Found existing account data ({name}, Lv.{level}).\nRecover it into this account?',
        'char.status.recoveryBlocked': 'Recovery was blocked because the source data is older than the current account.',
        'char.status.recoveryError': 'An error occurred during recovery.',
        'char.status.recoveryDone': 'Recovery complete. Please wait...',
        'char.status.uidMissing': 'No data exists for that UID.',
        'char.status.nameTooLong': 'Name can be up to 8 characters.',
        'char.status.duplicateName': 'That name already exists.',
        'char.status.createDone': 'Character created!',
        'char.status.createError': 'An error occurred while creating the character.',
        'char.reset.confirm': 'Manastone, stats, and skills except level will be reset.\nSpent manastone and stats will be returned.\n\nContinue?',
        'char.reset.done': 'Reset complete!\nReturned stats: {stats}\nReturned manastone: {manastone}',

        'settings.title': 'Settings',
        'settings.sound': 'Sound',
        'settings.masterVolume': 'Master volume',
        'settings.basicAttackSound': 'Basic attack sound',
        'settings.muted': 'Mute all',
        'settings.gameplay': 'Gameplay',
        'settings.language': 'Language',
        'settings.autoFullscreen': 'Mobile landscape auto fullscreen',
        'settings.orientationLock': 'Orientation lock',
        'settings.reducedEffects': 'Reduce combat effects',
        'settings.shortcutHints': 'Show PC shortcut hints',
        'settings.close': 'Close',

        'quest.tutorialTitle': 'Tutorial · {title}',
        'quest.guideRewardTitle': 'Progress Guide',
        'quest.tutorialProgress': 'Step {step}/{total} · Progress {current}/{target}',
        'quest.tutorialAfter': 'Step {step}/{total} · The slime quest begins after training.',
        'quest.progress': 'Progress: {current}/{target}',
        'quest.claimTitle': 'Claim reward!',
        'quest.rewardTitle': 'Quest Reward',
        'quest.claimDesktop': 'Click or press Q to gain {reward}',
        'quest.claimTouch': 'Click to gain {reward}',
        'quest.slime10.title': '1. Defeat 10 slimes',
        'quest.slime10.reward': 'Wisdom stat +2',
        'quest.slime30.title': '2. Defeat 30 slimes (Descent)',
        'quest.slime30.reward': 'Vitality stat +3, summon King Slime',
        'quest.king.title': '3. Defeat King Slime',
        'quest.king.reward': 'Blessed Weapon Upgrade Stone x3',
        'quest.repeatBoss.title': '5. Defeat King Slime (Repeat)',
        'quest.repeatBoss.reward': 'Blessed Weapon Upgrade Stone x1',
        'quest.repeatSlime.title': '4. Defeat 50 slimes (Summon)',
        'quest.repeatSlime.reward': 'Summon King Slime',

        'ui.autoAttackToggle': '[Auto]',
        'ui.autoAttackEnabled': 'Auto basic attack enabled',
        'ui.autoAttackDisabled': 'Auto basic attack disabled',

        'system.prologueCompleted': 'Prologue complete. Investigate the strange signs around the cabin.',
        'system.questStart': 'Finish basic training to unlock the first slime quest.',
        'system.tutorialCompleted': 'Tutorial complete: {title}',
        'system.tutorialEnd': 'Training is over. Begin hunting slimes.',
        'system.questAvailable': 'Quest ready to complete: {title}',
        'system.zoneEnter': '{name}',
        'system.transitionKicker': 'Traveling',
        'system.portalMoving': 'Moving to {label}...',
        'system.languageChanged': 'Language changed to English.'
    }
};

export default class LocalizationManager {
    constructor() {
        this.supportedLanguages = SUPPORTED_LANGUAGES;
        this.storageKey = LANGUAGE_STORAGE_KEY;
        this.originalTextNodes = new WeakMap();
        this.originalAttributes = new WeakMap();
        this.language = this.sanitizeLanguage(this.loadStoredLanguage() || this.detectBrowserLanguage());
        this.applyDocumentLanguage();
    }

    sanitizeLanguage(language = 'ko') {
        const normalized = String(language || '').trim().toLowerCase();
        if (normalized.startsWith('ja')) return 'ja';
        if (normalized.startsWith('en')) return 'en';
        return 'ko';
    }

    detectBrowserLanguage() {
        return this.sanitizeLanguage(navigator.language || navigator.userLanguage || 'ko');
    }

    loadStoredLanguage() {
        try {
            return localStorage.getItem(this.storageKey);
        } catch (error) {
            return null;
        }
    }

    getLanguage() {
        return this.language;
    }

    getSupportedLanguages() {
        return [...this.supportedLanguages];
    }

    setLanguage(language, options = {}) {
        const nextLanguage = this.sanitizeLanguage(language);
        const changed = nextLanguage !== this.language;
        this.language = nextLanguage;
        this.applyDocumentLanguage();

        try {
            localStorage.setItem(this.storageKey, this.language);
        } catch (error) {
            // localStorage can fail in private contexts; language still applies in memory.
        }

        if (changed && options.announce !== false) {
            window.dispatchEvent(new CustomEvent('yurika:languageChanged', {
                detail: { language: this.language }
            }));
        }

        return this.language;
    }

    applyDocumentLanguage() {
        document.documentElement.lang = this.language;
        document.body?.setAttribute('data-language', this.language);
    }

    t(key, params = {}) {
        const dict = TRANSLATIONS[this.language] || TRANSLATIONS.ko;
        const fallbackDict = TRANSLATIONS.ko;
        const template = dict[key] ?? fallbackDict[key] ?? key;
        return String(template).replace(/\{(\w+)\}/g, (_, name) => {
            const value = params?.[name];
            return value === undefined || value === null ? '' : String(value);
        });
    }

    translateLiteral(value) {
        const source = String(value ?? '');
        if (!source || this.language === 'ko') return source;

        const dict = STATIC_TEXT_TRANSLATIONS[this.language] || {};
        const direct = dict[source];
        if (direct !== undefined) return direct;

        const trimmed = source.trim();
        if (!trimmed) return source;

        const translated = dict[trimmed];
        if (translated === undefined) return source;

        const prefix = source.match(/^\s*/)?.[0] || '';
        const suffix = source.match(/\s*$/)?.[0] || '';
        return `${prefix}${translated}${suffix}`;
    }

    translateRichText(value) {
        const source = String(value ?? '');
        if (!source || this.language === 'ko') return source;

        const dict = STATIC_TEXT_TRANSLATIONS[this.language] || {};
        let translated = dict[source] ?? dict[source.trim()] ?? source;
        if (translated !== source) return translated;

        const entries = Object.entries(dict)
            .filter(([from]) => from && source.includes(from))
            .sort((a, b) => b[0].length - a[0].length);

        entries.forEach(([from, to]) => {
            translated = translated.split(from).join(to);
        });
        return translated;
    }

    shouldSkipDomNode(node, options = {}) {
        const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
        if (!element) return true;
        const selector = options.attribute
            ? 'script, style, noscript, canvas, [contenteditable="true"]'
            : SKIP_TRANSLATION_SELECTOR;
        return !!element.closest?.(`${selector}, ${DYNAMIC_TRANSLATION_SKIP_SELECTOR}`);
    }

    translateStaticDom(root = document.body) {
        if (!root) return;

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
                if (!node?.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
                if (this.shouldSkipDomNode(node)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });

        const textNodes = [];
        while (walker.nextNode()) textNodes.push(walker.currentNode);

        textNodes.forEach((node) => {
            const original = this.originalTextNodes.get(node) ?? node.nodeValue;
            this.originalTextNodes.set(node, original);
            node.nodeValue = this.language === 'ko'
                ? original
                : this.translateLiteral(original);
        });

        const attrSelector = TRANSLATABLE_ATTRIBUTES.map((attr) => `[${attr}]`).join(',');
        root.querySelectorAll?.(attrSelector).forEach((el) => {
            if (this.shouldSkipDomNode(el, { attribute: true })) return;
            let originalAttrs = this.originalAttributes.get(el);
            if (!originalAttrs) {
                originalAttrs = {};
                this.originalAttributes.set(el, originalAttrs);
            }

            TRANSLATABLE_ATTRIBUTES.forEach((attr) => {
                if (!el.hasAttribute(attr)) return;
                if (originalAttrs[attr] === undefined) {
                    originalAttrs[attr] = el.getAttribute(attr) || '';
                }
                const original = originalAttrs[attr];
                el.setAttribute(attr, this.language === 'ko'
                    ? original
                    : this.translateLiteral(original));
            });
        });
    }

    pick(value, field = null, fallback = '') {
        if (!value || typeof value !== 'object') return fallback;
        const localized = value.i18n?.[this.language] || null;
        if (field && localized && localized[field] !== undefined) return localized[field];
        if (!field && localized !== null) return localized;
        if (field && value[field] !== undefined) return value[field];
        return fallback;
    }

    localizeContent(value) {
        if (Array.isArray(value)) {
            return value.map((item) => this.localizeContent(item));
        }

        if (!value || typeof value !== 'object') {
            return value;
        }

        const localizedFields = value.i18n?.[this.language] && typeof value.i18n[this.language] === 'object'
            ? value.i18n[this.language]
            : null;

        const next = {};
        Object.entries(value).forEach(([key, entryValue]) => {
            next[key] = this.localizeContent(entryValue);
        });

        if (localizedFields) {
            Object.entries(localizedFields).forEach(([key, entryValue]) => {
                next[key] = this.localizeContent(entryValue);
            });
        }

        return next;
    }
}
