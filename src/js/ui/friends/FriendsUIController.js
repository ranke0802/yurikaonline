import Logger from '../../utils/Logger.js';

export const FRIENDS_UI_METHOD_NAMES = [
    'setupFriendsUI',
    'isPopupOpen',
    'setFriendsAlertActive',
    'getFriendsPopupMode',
    'setFriendsMobileView',
    'syncFriendsPopupLayout',
    'getSelectedFriendName',
    'toggleFriendSearchModal',
    'renderFriendSearchResult',
    'selectFriend',
    'getFriendThreadMeta',
    'hasUnreadFriendThread',
    'buildSortedFriendEntries',
    'refreshFriendThreadList',
    'openFriendChat',
    'closeFriendChat',
    'setFriendGiftComposerVisible',
    'setFriendGiftKind',
    'refreshFriendGiftOptions',
    'renderFriendChatMessages',
    'formatFriendTime',
    'buildFriendGiftSummary',
    'buildFriendDerivedStats',
    'getFriendStatusText',
    'getFriendAvatarText',
    'getFriendWeaponDisplayData',
    'ensureFriendWeaponTooltip',
    'showFriendWeaponTooltip',
    'positionFriendWeaponTooltip',
    'hideFriendWeaponTooltip',
    'renderSelectedFriendDetail',
    'renderFriendProfileWeapon',
    'refreshFriendsPopup'
];

export default class FriendsUIController {
    constructor(ui) {
        this.ui = ui;

        return new Proxy(this, {
            get(target, prop, receiver) {
                if (prop in target) {
                    const value = Reflect.get(target, prop, receiver);
                    return typeof value === 'function' ? value.bind(receiver) : value;
                }

                const value = ui[prop];
                return typeof value === 'function' ? value.bind(ui) : value;
            },
            set(target, prop, value, receiver) {
                if (prop in target || !(prop in ui)) {
                    return Reflect.set(target, prop, value, receiver);
                }

                ui[prop] = value;
                return true;
            },
            has(target, prop) {
                return prop in target || prop in ui;
            }
        });
    }

    setupFriendsUI() {
        const popup = document.getElementById('friends-popup');
        const searchModal = document.getElementById('friends-add-modal');
        const chatModal = document.getElementById('friend-chat-modal');
        const searchInput = document.getElementById('friend-search-query-input');
        const searchBtn = document.getElementById('friend-search-query-btn');
        const searchAddBtn = document.getElementById('friend-search-add-btn');
        const togetherBtn = document.getElementById('friend-profile-together-btn');
        const chatBtn = document.getElementById('friend-profile-chat-btn');
        const giftBtn = document.getElementById('friend-profile-gift-btn');
        const removeBtn = document.getElementById('friend-profile-remove-btn');
        const chatSendBtn = document.getElementById('friend-chat-send-btn');
        const chatInput = document.getElementById('friend-chat-input');
        const chatMessages = document.getElementById('friend-chat-messages');
        const chatGiftToggleBtn = document.getElementById('friend-chat-gift-toggle-btn');
        const giftKindManastoneBtn = document.getElementById('friend-gift-kind-manastone');
        const giftKindItemBtn = document.getElementById('friend-gift-kind-item');
        const giftItemSelect = document.getElementById('friend-gift-item-select');
        const giftItemAmountInput = document.getElementById('friend-gift-item-amount');
        const giftManastoneAmountInput = document.getElementById('friend-gift-manastone-amount');
        const giftSendBtn = document.getElementById('friend-gift-send-btn');

        const openSearchModal = () => this.toggleFriendSearchModal(true);
        const closeSearchModal = () => this.toggleFriendSearchModal(false);

        document.getElementById('friend-open-search-btn')?.addEventListener('click', openSearchModal);
        document.getElementById('friend-open-search-inline-btn')?.addEventListener('click', openSearchModal);
        document.getElementById('friend-search-close-btn')?.addEventListener('click', closeSearchModal);
        document.getElementById('friend-profile-back-btn')?.addEventListener('click', () => {
            this.setFriendsMobileView('list', { force: true });
        });

        searchModal?.addEventListener('click', (event) => {
            if (event.target === searchModal || event.target?.classList?.contains('friends-floating-scrim')) {
                closeSearchModal();
            }
        });

        chatModal?.addEventListener('click', (event) => {
            if (event.target === chatModal || event.target?.classList?.contains('friends-floating-scrim')) {
                this.closeFriendChat();
            }
        });

        const runLookup = async () => {
            const query = searchInput?.value?.trim() || '';
            if (!query || !this.game.net) {
                this.friendSearchResult = null;
                this.renderFriendSearchResult('친구를 찾으려면 아이디 또는 이름을 입력해 주세요.');
                return;
            }

            this.friendSearchResult = null;
            this.renderFriendSearchResult('조회 중입니다...');

            try {
                const candidate = await this.game.net.lookupFriendCandidate(query);
                if (!candidate) {
                    this.renderFriendSearchResult('대상을 찾지 못했습니다.');
                    return;
                }

                this.friendSearchResult = {
                    query,
                    ...candidate
                };
                if (candidate.profile) {
                    this.friendProfileCache.set(candidate.uid, candidate.profile);
                }
                this.renderFriendSearchResult();
            } catch (error) {
                Logger.warn('[UI] Failed to lookup friend candidate', error);
                this.friendSearchResult = null;
                this.renderFriendSearchResult('검색 중 오류가 발생했습니다.');
            }
        };

        searchBtn?.addEventListener('click', runLookup);
        searchInput?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            runLookup();
        });

        searchAddBtn?.addEventListener('click', async () => {
            if (!this.friendSearchResult || !this.game.net) return;

            const targetUid = this.friendSearchResult.uid;
            if (targetUid === this.game.localPlayer?.id) {
                this.showGenericModal('친구 추가', '자기 자신은 친구 목록에 추가할 수 없습니다.', null, null, { hideNo: true, yesText: '확인' });
                return;
            }

            if (this.game.net.isFriend(targetUid)) {
                await this.selectFriend(targetUid);
                closeSearchModal();
                return;
            }

            const result = await this.game.net.addFriendByQuery(targetUid || this.friendSearchResult.query);
            if (!result.ok) {
                const messages = {
                    invalid_name: '올바른 아이디 또는 이름을 입력해 주세요.',
                    not_found: '대상을 찾지 못했습니다.',
                    self: '자기 자신은 친구 목록에 추가할 수 없습니다.',
                    already_friend: '이미 친구입니다.',
                    profile_missing: '상대 프로필을 아직 불러올 수 없습니다.'
                };
                this.showGenericModal('친구 추가', messages[result.reason] || '친구 추가 중 오류가 발생했습니다.', null, null, { hideNo: true, yesText: '확인' });
                return;
            }

            this.showGenericModal('친구 추가', `"${result.name}" 님을 친구로 추가했습니다.`, null, null, { hideNo: true, yesText: '확인' });
            this.friendSearchResult = null;
            if (searchInput) searchInput.value = '';
            this.renderFriendSearchResult('친구를 찾으려면 아이디 또는 이름을 입력해 주세요.');
            closeSearchModal();
            await this.selectFriend(result.uid);
        });

        togetherBtn?.addEventListener('click', async () => {
            if (!this.selectedFriendUid || !this.game.net) return;
            const result = await this.game.net.requestTogether(this.selectedFriendUid);
            const messages = {
                SENT: '함께하기 요청을 보냈습니다.',
                SELF: '자기 자신에게는 요청할 수 없습니다.',
                NOT_FRIEND: '친구에게만 함께하기를 요청할 수 있습니다.',
                OFFLINE: '상대가 현재 접속 중이 아닙니다.',
                BUSY: '이미 함께 플레이 중입니다. 현재 함께하기를 먼저 종료해 주세요.',
                ERROR: '함께하기 요청 중 오류가 발생했습니다.'
            };
            this.showGenericModal('함께하기', messages[result] || '처리할 수 없습니다.', null, null, { hideNo: true, yesText: '확인' });
        });

        chatBtn?.addEventListener('click', () => {
            if (!this.selectedFriendUid) return;
            this.openFriendChat(this.selectedFriendUid);
        });

        giftBtn?.addEventListener('click', () => {
            if (!this.selectedFriendUid) return;
            this.openFriendChat(this.selectedFriendUid, { openGift: true });
        });

        removeBtn?.addEventListener('click', () => {
            if (!this.selectedFriendUid || !this.game.net) return;
            const friendUid = this.selectedFriendUid;
            const friendName = this.getSelectedFriendName();
            this.showConfirm(`"${friendName}" 님을 친구 목록에서 삭제할까요?`, async (confirmed) => {
                if (!confirmed) return;
                await this.game.net.removeFriend(friendUid);
                if (this.friendChatUid === friendUid) {
                    this.closeFriendChat({ detachThread: true, keepSelection: false, silent: true });
                }
                this.selectedFriendUid = null;
                this.setFriendsMobileView('list', { force: true });
                this.refreshFriendsPopup();
            });
        });

        document.getElementById('friend-chat-close-btn')?.addEventListener('click', () => this.closeFriendChat());
        document.getElementById('friend-chat-back-btn')?.addEventListener('click', () => this.closeFriendChat({ detachThread: true }));
        chatGiftToggleBtn?.addEventListener('click', () => {
            const composer = document.getElementById('friend-gift-composer');
            this.setFriendGiftComposerVisible(composer?.classList.contains('hidden'));
        });

        chatSendBtn?.addEventListener('click', async () => {
            const targetUid = this.friendChatUid || this.selectedFriendUid;
            if (!targetUid || !this.game.net) return;

            const text = chatInput?.value?.trim() || '';
            if (!text) return;

            const result = await this.game.net.sendFriendMessage(targetUid, text);
            if (!result.ok) {
                const messages = {
                    invalid_message: '보낼 메시지를 입력해 주세요.',
                    not_friend: '친구에게만 메시지를 보낼 수 있습니다.'
                };
                this.showGenericModal('친구 메시지', messages[result.reason] || '메시지 전송 중 오류가 발생했습니다.', null, null, { hideNo: true, yesText: '확인' });
                return;
            }

            if (chatInput) {
                chatInput.value = '';
                chatInput.style.height = '';
            }
            this.renderFriendChatMessages();
        });

        chatInput?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' || event.shiftKey) return;
            event.preventDefault();
            chatSendBtn?.click();
        });

        giftKindManastoneBtn?.addEventListener('click', () => this.setFriendGiftKind('manastone'));
        giftKindItemBtn?.addEventListener('click', () => this.setFriendGiftKind('item'));
        document.getElementById('friend-gift-cancel-btn')?.addEventListener('click', () => this.setFriendGiftComposerVisible(false));
        giftItemSelect?.addEventListener('change', () => this.refreshFriendGiftOptions());
        giftItemAmountInput?.addEventListener('input', () => this.refreshFriendGiftOptions());
        giftManastoneAmountInput?.addEventListener('input', () => this.refreshFriendGiftOptions());

        giftSendBtn?.addEventListener('click', async () => {
            const targetUid = this.friendChatUid || this.selectedFriendUid;
            if (!targetUid || !this.game.net) return;

            let result = null;
            if (this.friendGiftKind === 'item') {
                const inventoryIndex = Number(giftItemSelect?.value || -1);
                const amount = Math.max(1, Math.floor(Number(giftItemAmountInput?.value || 1)));
                result = await this.game.net.sendFriendGift(targetUid, { kind: 'item', inventoryIndex, amount });
            } else {
                const amount = Math.max(1, Math.floor(Number(giftManastoneAmountInput?.value || 0)));
                result = await this.game.net.sendFriendGift(targetUid, { kind: 'manastone', amount });
            }

            if (!result?.ok) {
                const messages = {
                    invalid_gift: '보낼 선물 정보를 다시 확인해 주세요.',
                    invalid_item: '보낼 수 있는 아이템이 아닙니다.',
                    invalid_amount: '수량을 다시 확인해 주세요.',
                    insufficient_manastone: '마석이 부족합니다.',
                    not_friend: '친구에게만 선물을 보낼 수 있습니다.',
                    send_failed: '선물 전송 중 오류가 발생했습니다.'
                };
                this.showGenericModal('선물 보내기', messages[result?.reason] || '선물 전송 중 오류가 발생했습니다.', null, null, { hideNo: true, yesText: '확인' });
                return;
            }

            this.setFriendGiftComposerVisible(false);
            this.refreshFriendGiftOptions();
            this.renderFriendChatMessages();
        });

        chatMessages?.addEventListener('click', async (event) => {
            const claimButton = event.target?.closest?.('[data-claim-gift-id]');
            if (!claimButton || !this.friendChatUid || !this.game.net) return;

            const messageId = claimButton.getAttribute('data-claim-gift-id');
            if (!messageId) return;

            claimButton.disabled = true;
            const result = await this.game.net.claimFriendGift(this.friendChatUid, messageId);
            if (!result.ok) {
                const messages = {
                    invalid_claim: '수령할 수 없는 선물입니다.',
                    invalid_thread: '대화 정보를 다시 불러와 주세요.',
                    gift_missing: '선물 정보를 찾지 못했습니다.',
                    not_recipient: '내가 받은 선물만 수령할 수 있습니다.',
                    already_claimed: '이미 수령이 완료된 선물입니다.',
                    player_missing: '캐릭터 정보를 확인하지 못했습니다.'
                };
                this.showGenericModal('선물 수령', messages[result.reason] || '선물 수령 중 오류가 발생했습니다.', null, null, { hideNo: true, yesText: '확인' });
            }
            this.renderFriendChatMessages();
            this.refreshFriendsPopup();
        });

        if (this.game.net) {
            this.game.net.on('friendsUpdated', () => this.refreshFriendsPopup());
            this.game.net.on('presenceChanged', () => this.refreshFriendsPopup());
            this.game.net.on('partyUpdated', () => this.refreshFriendsPopup());
            this.game.net.on('friendThreadMetaUpdated', () => this.refreshFriendsPopup());
            this.game.net.on('friendThreadUpdated', (data) => {
                this.refreshFriendsPopup();
                if (data?.uid && data.uid === this.friendChatUid) {
                    this.renderFriendChatMessages();
                }
            });
            this.game.net.on('friendMessageReceived', (data) => {
                const friendUid = data?.friendUid || data?.fromUid || null;
                const chatOpen = !document.getElementById('friend-chat-modal')?.classList.contains('hidden');
                const isActiveChat = !!friendUid && chatOpen && this.friendChatUid === friendUid;

                if (data?.kind === 'thread') {
                    if (!isActiveChat) {
                        const senderName = data?.fromName || '친구';
                        this.logSystemMessage(`[친구] ${senderName}님의 새 메시지가 도착했습니다.`);
                    } else if (this.game.net?.markFriendThreadRead) {
                        this.game.net.markFriendThreadRead(friendUid).catch(() => { });
                    }
                } else {
                    const senderName = data?.fromName || '친구';
                    this.logSystemMessage(`[친구 메시지] ${senderName}: ${data?.text || ''}`);
                }

                if (!this.isPopupOpen('friends-popup') || !isActiveChat) {
                    this.setFriendsAlertActive(true);
                }
                this.refreshFriendsPopup();
            });
            this.game.net.on('togetherRequestReceived', (data) => {
                this.showGenericModal(
                    '함께하기 요청',
                    `"${data.fromName}" 님이 함께 플레이를 요청했습니다. 수락하면 상대가 내 필드로 합류합니다.`,
                    async () => {
                        const result = await this.game.net.respondToTogetherRequest(data.id, data.fromUid, true);
                        if (!result?.ok) {
                            const failMessage = result?.reason === 'party_full'
                                ? '현재 함께 플레이 중인 인원이 이미 가득 찼습니다.'
                                : '지금은 함께하기를 수락할 수 없습니다.';
                            this.showGenericModal('함께하기', failMessage, null, null, { hideNo: true, yesText: '확인' });
                        }
                    },
                    async () => {
                        await this.game.net.respondToTogetherRequest(data.id, data.fromUid, false);
                    },
                    { yesText: '수락', noText: '거절' }
                );
            });
            this.game.net.on('togetherResponseReceived', (data) => {
                if (!data?.accept) {
                    const failMessages = {
                        declined: '상대가 함께하기 요청을 거절했습니다.',
                        host_busy: '상대가 지금은 손님을 받을 수 없습니다.',
                        party_full: '상대 필드의 최대 인원입니다.'
                    };
                    this.showGenericModal('함께하기', failMessages[data?.reason] || '함께하기 요청이 수락되지 않았습니다.', null, null, { hideNo: true, yesText: '확인' });
                    return;
                }

                if (data.party) {
                    this.game.net._applyLocalPartyState(data.party);
                    this.updatePartyUI();
                }

                const hostPosition = data.hostPosition || null;
                const player = this.game.localPlayer;
                if (player && hostPosition && Number.isFinite(hostPosition.x) && Number.isFinite(hostPosition.y)) {
                    player.x = hostPosition.x + 48;
                    player.y = hostPosition.y + 24;
                    player.moveTarget = null;
                    player.saveState(true);
                }

                this.showGenericModal('함께하기', `"${data.fromName}" 님의 필드에 합류했습니다.`, null, null, { hideNo: true, yesText: '확인' });
            });
        }

        popup?.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                if (!chatModal?.classList.contains('hidden')) {
                    this.closeFriendChat();
                } else if (!searchModal?.classList.contains('hidden')) {
                    closeSearchModal();
                }
            }
        });

        this.renderFriendSearchResult('친구를 찾으려면 아이디 또는 이름을 입력해 주세요.');
        this.setFriendGiftKind(this.friendGiftKind);
        this.setFriendGiftComposerVisible(false);
        this.refreshFriendsPopup();
        this.syncFriendsPopupLayout();
    }

    isPopupOpen(id) {
        const popup = document.getElementById(id);
        return !!popup && !popup.classList.contains('hidden');
    }

    setFriendsAlertActive(active) {
        this.friendAlertCount = active ? 1 : 0;
        const dot = document.getElementById('friends-alert-dot');
        if (dot) {
            dot.classList.toggle('active', !!active);
        }
    }

    getFriendsPopupMode() {
        const isTouch = window.matchMedia?.('(pointer: coarse)')?.matches || navigator.maxTouchPoints > 0;
        const isMobile = isTouch && window.innerWidth <= 1024;
        if (!isMobile) return 'desktop';
        return this.isMobileLandscapeViewport() ? 'mobileLandscape' : 'mobilePortrait';
    }

    setFriendsMobileView(view = 'list', options = {}) {
        const allowedViews = new Set(['list', 'profile']);
        const requestedView = allowedViews.has(view) ? view : 'list';
        const nextView = requestedView === 'profile' && !this.selectedFriendUid ? 'list' : requestedView;
        const changed = this.friendsMobileView !== nextView;
        this.friendsMobileView = nextView;
        if (changed || options.force) {
            this.syncFriendsPopupLayout();
        }
    }

    syncFriendsPopupLayout() {
        const popup = document.getElementById('friends-popup');
        if (!popup) return;

        const mode = this.getFriendsPopupMode();
        const isMobile = mode !== 'desktop';
        if (isMobile && this.friendsMobileView === 'profile' && !this.selectedFriendUid) {
            this.friendsMobileView = 'list';
        }

        popup.dataset.friendsMode = mode;
        popup.dataset.friendsView = isMobile ? (this.friendsMobileView || 'list') : 'split';
    }

    getSelectedFriendName() {
        const friend = (this.game.net?.getFriendListSnapshot?.() || []).find((entry) => entry.uid === this.selectedFriendUid);
        return friend?.name || '친구';
    }

    toggleFriendSearchModal(visible) {
        const modal = document.getElementById('friends-add-modal');
        if (!modal) return;

        const nextVisible = !!visible;
        modal.classList.toggle('hidden', !nextVisible);

        if (nextVisible) {
            if (!this.friendSearchResult) {
                this.renderFriendSearchResult('친구를 찾으려면 아이디 또는 이름을 입력해 주세요.');
            }
            window.setTimeout(() => {
                document.getElementById('friend-search-query-input')?.focus();
            }, 0);
        }
    }

    renderFriendSearchResult(message = '') {
        const resultEl = document.getElementById('friend-search-result-card');
        const addBtn = document.getElementById('friend-search-add-btn');
        if (!resultEl || !addBtn) return;

        const candidate = this.friendSearchResult;
        if (!candidate) {
            resultEl.classList.add('is-placeholder');
            resultEl.innerHTML = `<p>${this.escapeHtml(message || '친구를 찾으려면 아이디 또는 이름을 입력해 주세요.')}</p>`;
            addBtn.textContent = '친구 추가';
            addBtn.disabled = true;
            return;
        }

        const isSelf = candidate.uid === this.game.localPlayer?.id;
        const alreadyFriend = !!candidate.isFriend || !!this.game.net?.isFriend?.(candidate.uid);
        const avatarText = this.escapeHtml(this.getFriendAvatarText(candidate.name || candidate.uid));
        const displayName = this.escapeHtml(candidate.name || candidate.uid);
        const uidText = this.escapeHtml(candidate.uid);
        const statusText = this.getFriendStatusText(candidate.online);
        const stateLabel = isSelf ? '내 캐릭터' : (alreadyFriend ? '이미 친구' : '추가 가능');

        resultEl.classList.remove('is-placeholder');
        resultEl.innerHTML = `
            <div class="friends-search-candidate">
                <div class="friends-search-candidate-avatar">${avatarText}</div>
                <div class="friends-search-candidate-body">
                    <div class="friends-search-candidate-topline">
                        <strong>${displayName}</strong>
                        <span class="friends-status-chip${candidate.online ? ' is-online' : ''}">${statusText}</span>
                    </div>
                    <p>ID: ${uidText}</p>
                    <div class="friends-search-candidate-tags">
                        <span>${this.escapeHtml(stateLabel)}</span>
                        <span>${candidate.matchType === 'uid' ? '아이디 일치' : '이름 일치'}</span>
                    </div>
                </div>
            </div>
        `;

        if (isSelf) {
            addBtn.textContent = '추가 불가';
            addBtn.disabled = true;
        } else if (alreadyFriend) {
            addBtn.textContent = '프로필 보기';
            addBtn.disabled = false;
        } else {
            addBtn.textContent = '친구 추가';
            addBtn.disabled = false;
        }
    }

    async selectFriend(uid) {
        if (!uid || !this.game.net) return;
        this.selectedFriendUid = uid;
        if (this.friendChatUid && this.friendChatUid !== uid) {
            this.closeFriendChat({ detachThread: true, keepSelection: true, silent: true });
        }

        if (this.getFriendsPopupMode() !== 'desktop') {
            this.setFriendsMobileView('profile', { force: true });
        }

        this.refreshFriendsPopup();

        if (!this.friendProfileCache.has(uid)) {
            const profile = await this.game.net.getPlayerProfile(uid);
            if (profile) {
                this.friendProfileCache.set(uid, profile);
            }
        }

        this.refreshFriendsPopup();
    }

    getFriendThreadMeta(uid) {
        return this.game.net?.getFriendThreadMetaSnapshot?.(uid) || null;
    }

    hasUnreadFriendThread(uid) {
        const meta = this.getFriendThreadMeta(uid);
        if (!meta) return false;
        const updatedAt = Number(meta.updatedAt || 0);
        const lastReadTs = Number(meta.lastReadTs || 0);
        const lastSenderUid = String(meta.lastSenderUid || '');
        return updatedAt > lastReadTs && !!lastSenderUid && lastSenderUid !== this.game.net?.playerId;
    }

    buildSortedFriendEntries(friends = []) {
        return friends
            .map((friend) => {
                const meta = this.getFriendThreadMeta(friend.uid);
                return {
                    ...friend,
                    meta,
                    unread: this.hasUnreadFriendThread(friend.uid)
                };
            })
            .sort((a, b) => {
                if (a.unread !== b.unread) return a.unread ? -1 : 1;
                const timeDelta = Number(b.meta?.updatedAt || 0) - Number(a.meta?.updatedAt || 0);
                if (timeDelta !== 0) return timeDelta;
                if (!!a.online !== !!b.online) return a.online ? -1 : 1;
                return String(a.name || a.uid || '').localeCompare(String(b.name || b.uid || ''), 'ko');
            });
    }

    refreshFriendThreadList(entries = []) {
        const listEl = document.getElementById('friend-thread-list');
        if (!listEl) return;

        listEl.innerHTML = '';
        if (!entries.length) {
            listEl.innerHTML = '<div class="friends-thread-empty">아직 등록된 친구가 없습니다.</div>';
            return;
        }

        entries.forEach((entry) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = `friend-thread-item${entry.uid === this.selectedFriendUid ? ' is-selected' : ''}${entry.unread ? ' is-unread' : ''}`;
            const avatar = this.escapeHtml(this.getFriendAvatarText(entry.name || entry.uid));
            const preview = this.escapeHtml(entry.meta?.lastMessage || '대화를 시작해 보세요.');
            const updatedAt = this.formatFriendTime(entry.meta?.updatedAt || 0);
            item.innerHTML = `
                <div class="friend-thread-avatar" aria-hidden="true">${avatar}</div>
                <div class="friend-thread-content">
                    <div class="friend-thread-topline">
                        <strong class="friend-thread-name">${this.escapeHtml(entry.name || entry.uid)}</strong>
                        <span class="friend-thread-time">${this.escapeHtml(updatedAt)}</span>
                    </div>
                    <div class="friend-thread-bottomline">
                        <span class="friend-thread-preview">${preview}</span>
                        ${entry.unread ? '<span class="friend-thread-unread-dot" aria-hidden="true"></span>' : `<span class="friends-status-chip${entry.online ? ' is-online' : ''}">${this.getFriendStatusText(entry.online)}</span>`}
                    </div>
                </div>
            `;
            item.addEventListener('click', () => {
                this.selectFriend(entry.uid);
            });
            listEl.appendChild(item);
        });
    }

    async openFriendChat(uid, options = {}) {
        if (!uid || !this.game.net?.isFriend?.(uid)) return;

        await this.selectFriend(uid);
        this.friendChatUid = uid;
        this.game.net.openFriendThread(uid);

        document.getElementById('friend-chat-modal')?.classList.remove('hidden');
        this.setFriendGiftComposerVisible(!!options.openGift);
        this.refreshFriendGiftOptions();
        this.renderFriendChatMessages();

        window.setTimeout(() => {
            document.getElementById('friend-chat-input')?.focus();
        }, 0);
    }

    closeFriendChat(options = {}) {
        const {
            detachThread = true,
            keepSelection = true,
            silent = false
        } = options;

        document.getElementById('friend-chat-modal')?.classList.add('hidden');
        document.getElementById('friend-chat-input')?.blur();
        this.setFriendGiftComposerVisible(false);

        if (detachThread) {
            this.game.net?.closeFriendThread?.(this.friendChatUid);
        }

        this.friendChatUid = null;
        if (!keepSelection) {
            this.selectedFriendUid = null;
        }
        if (this.getFriendsPopupMode() !== 'desktop') {
            this.setFriendsMobileView(this.selectedFriendUid ? 'profile' : 'list', { force: true });
        }
        if (!silent) {
            this.refreshFriendsPopup();
        }
    }

    setFriendGiftComposerVisible(visible) {
        const composer = document.getElementById('friend-gift-composer');
        const toggleBtn = document.getElementById('friend-chat-gift-toggle-btn');
        const nextVisible = !!visible;

        composer?.classList.toggle('hidden', !nextVisible);
        if (toggleBtn) {
            toggleBtn.textContent = nextVisible ? '접기' : '선물';
        }
        if (nextVisible) {
            this.refreshFriendGiftOptions();
        }
    }

    setFriendGiftKind(kind = 'manastone') {
        this.friendGiftKind = kind === 'item' ? 'item' : 'manastone';
        document.getElementById('friend-gift-kind-manastone')?.classList.toggle('is-active', this.friendGiftKind === 'manastone');
        document.getElementById('friend-gift-kind-item')?.classList.toggle('is-active', this.friendGiftKind === 'item');
        document.getElementById('friend-gift-manastone-panel')?.classList.toggle('hidden', this.friendGiftKind !== 'manastone');
        document.getElementById('friend-gift-item-panel')?.classList.toggle('hidden', this.friendGiftKind !== 'item');
        this.refreshFriendGiftOptions();
    }

    refreshFriendGiftOptions() {
        const balanceEl = document.getElementById('friend-gift-balance');
        const itemSelect = document.getElementById('friend-gift-item-select');
        const itemAmountInput = document.getElementById('friend-gift-item-amount');
        const manastoneAmountInput = document.getElementById('friend-gift-manastone-amount');
        const sendBtn = document.getElementById('friend-gift-send-btn');
        const player = this.game.localPlayer;
        if (!player) return;

        const manastone = Math.max(0, Number(player.manastone || 0));
        if (manastoneAmountInput) {
            manastoneAmountInput.max = String(Math.max(1, manastone));
            if (Number(manastoneAmountInput.value || 0) <= 0) {
                manastoneAmountInput.value = manastone > 0 ? '1' : '0';
            }
            if (manastone > 0 && Number(manastoneAmountInput.value || 0) > manastone) {
                manastoneAmountInput.value = String(manastone);
            }
        }

        const giftableItems = (player.inventory || [])
            .map((item, index) => ({ item, index }))
            .filter(({ item, index }) => index > 0 && item);

        if (itemSelect) {
            const previousValue = itemSelect.value;
            itemSelect.innerHTML = '';

            if (!giftableItems.length) {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = '보낼 수 있는 아이템이 없습니다.';
                itemSelect.appendChild(option);
                itemSelect.disabled = true;
            } else {
                giftableItems.forEach(({ item, index }) => {
                    const option = document.createElement('option');
                    option.value = String(index);
                    const amountText = item.stackable === false || item.slot
                        ? '장비'
                        : `x${Math.max(1, Number(item.amount || 1)).toLocaleString('ko-KR')}`;
                    option.textContent = `${item.name || item.type || '아이템'} (${amountText})`;
                    itemSelect.appendChild(option);
                });
                itemSelect.disabled = false;
                if (giftableItems.some(({ index }) => String(index) === previousValue)) {
                    itemSelect.value = previousValue;
                }
                if (!itemSelect.value && giftableItems[0]) {
                    itemSelect.value = String(giftableItems[0].index);
                }
            }
        }

        const selectedIndex = Number(itemSelect?.value || -1);
        const selectedItem = giftableItems.find(({ index }) => index === selectedIndex)?.item || null;
        if (itemAmountInput) {
            const maxAmount = selectedItem
                ? (selectedItem.stackable === false || selectedItem.slot ? 1 : Math.max(1, Number(selectedItem.amount || 1)))
                : 1;
            itemAmountInput.max = String(maxAmount);
            itemAmountInput.disabled = !selectedItem || maxAmount === 1;
            if (Number(itemAmountInput.value || 0) <= 0) {
                itemAmountInput.value = '1';
            }
            if (Number(itemAmountInput.value || 0) > maxAmount) {
                itemAmountInput.value = String(maxAmount);
            }
        }

        if (balanceEl) {
            if (this.friendGiftKind === 'item') {
                balanceEl.textContent = giftableItems.length
                    ? `보유 아이템 ${giftableItems.length}종`
                    : '보낼 수 있는 아이템이 없습니다.';
            } else {
                balanceEl.textContent = `보유 마석 ${manastone.toLocaleString('ko-KR')}`;
            }
        }

        if (sendBtn) {
            sendBtn.disabled = this.friendGiftKind === 'item'
                ? !selectedItem
                : manastone <= 0;
        }
    }

    renderFriendChatMessages() {
        const container = document.getElementById('friend-chat-messages');
        if (!container) return;

        const targetUid = this.friendChatUid || this.selectedFriendUid;
        if (!targetUid) {
            container.innerHTML = '<div class="friend-chat-empty">대화할 친구를 먼저 선택해 주세요.</div>';
            return;
        }

        const friend = (this.game.net?.getFriendListSnapshot?.() || []).find((entry) => entry.uid === targetUid) || null;
        const profile = this.friendProfileCache.get(targetUid) || null;
        const displayName = profile?.name || friend?.name || targetUid;
        const titleEl = document.getElementById('friend-chat-title');
        const statusEl = document.getElementById('friend-chat-status');
        if (titleEl) titleEl.textContent = displayName;
        if (statusEl) statusEl.textContent = this.getFriendStatusText(friend?.online);

        const messages = this.game.net?.getFriendThreadMessagesSnapshot?.(targetUid) || [];
        if (!messages.length) {
            container.innerHTML = '<div class="friend-chat-empty">아직 주고받은 메시지가 없습니다. 먼저 말을 걸어 보세요.</div>';
            container.scrollTop = container.scrollHeight;
            return;
        }

        container.innerHTML = '';
        const localUid = this.game.localPlayer?.id || this.game.net?.playerId;
        messages.forEach((message) => {
            const isMine = message.fromUid === localUid;
            const row = document.createElement('div');
            row.className = `friend-message-row${isMine ? ' is-mine' : ''}`;

            const bodyHtml = message.type === 'gift'
                ? this.buildFriendGiftSummary(message, { isMine })
                : `<p class="friend-message-text">${this.escapeHtml(message.text || '')}</p>`;

            row.innerHTML = `
                <div class="friend-message-bubble${message.type === 'gift' ? ' is-gift' : ''}">
                    ${bodyHtml}
                    <div class="friend-message-meta">${this.escapeHtml(this.formatFriendTime(message.ts))}</div>
                </div>
            `;
            container.appendChild(row);
        });

        container.scrollTop = container.scrollHeight;
    }

    formatFriendTime(ts) {
        const value = Number(ts || 0);
        if (!Number.isFinite(value) || value <= 0) return '';

        const date = new Date(value);
        const now = new Date();
        const sameDay = date.getFullYear() === now.getFullYear()
            && date.getMonth() === now.getMonth()
            && date.getDate() === now.getDate();

        if (sameDay) {
            return date.toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        return `${date.getMonth() + 1}/${date.getDate()}`;
    }

    buildFriendGiftSummary(message = {}, options = {}) {
        const gift = message.gift || {};
        const isMine = !!options.isMine;
        const amount = Math.max(1, Number(gift.amount || 1));
        const title = gift.kind === 'manastone'
            ? `마석 ${amount.toLocaleString('ko-KR')}`
            : `${gift.itemName || gift.itemId || '아이템'}${amount > 1 ? ` x${amount.toLocaleString('ko-KR')}` : ''}`;
        const description = isMine ? '선물을 보냈습니다.' : '선물이 도착했습니다.';

        let stateHtml = '';
        if (!isMine && gift.status === 'pending') {
            stateHtml = `<button type="button" class="friend-gift-claim-btn" data-claim-gift-id="${this.escapeHtml(message.id || '')}">수령하기</button>`;
        } else {
            const stateText = gift.status === 'claimed' ? '수령 완료' : '수령 대기';
            stateHtml = `<span class="friend-gift-state${gift.status === 'claimed' ? ' is-claimed' : ''}">${stateText}</span>`;
        }

        return `
            <div class="friend-gift-card">
                <strong>${this.escapeHtml(title)}</strong>
                <p>${this.escapeHtml(description)}</p>
                <div class="friend-gift-state-row">${stateHtml}</div>
            </div>
        `;
    }

    buildFriendDerivedStats(profile = {}) {
        const definition = this.game.localPlayer?.definition || {};
        const base = definition.baseStats || {};
        const growth = definition.growthStats || { hp: 10, mp: 10, atk: 1, def: 1 };
        const vitality = Number(profile.vitality || 1);
        const intelligence = Number(profile.intelligence || 3);
        const wisdom = Number(profile.wisdom || 2);
        const agility = Number(profile.agility || 1);
        const hp = Number(profile.hp || 0);
        const mp = Number(profile.mp || 0);
        const maxHp = (base.maxHp ?? 30) + (vitality * (growth.hp ?? 10));
        const maxMp = (base.maxMp ?? 50) + (wisdom * (growth.mp ?? 10));
        const attack = (base.atk ?? 10) + (intelligence * (growth.atk ?? 1)) + Math.floor(wisdom / 2);
        const defense = Number(profile.defense ?? ((base.def ?? 1) + (vitality * (growth.def ?? 1))));
        const attackSpeed = Math.min(2.0, 1.0 + (agility * 0.1) + (intelligence * 0.05));
        const critRate = 0.1 + (agility * 0.01) + (intelligence * 0.01);

        return {
            level: Number(profile.level || 1),
            hp,
            mp,
            maxHp,
            maxMp,
            vitality,
            intelligence,
            wisdom,
            agility,
            attack,
            defense,
            attackSpeed,
            critRate
        };
    }

    getFriendStatusText(isOnline) {
        return isOnline ? '접속 중' : '오프라인';
    }

    getFriendAvatarText(name) {
        const source = String(name || '').trim();
        if (!source) return '?';
        return Array.from(source)[0];
    }

    getFriendWeaponDisplayData(weapon) {
        if (!weapon) return null;

        const itemDefinition = this.game.itemData?.getItemDefinition?.(weapon.type || weapon.id) || null;
        const definitionIcon = itemDefinition?.icon || null;
        const displayWeapon = {
            ...itemDefinition,
            ...weapon,
            name: weapon.name || itemDefinition?.name || weapon.type || '무기',
            iconPath: weapon.iconPath
                || itemDefinition?.iconPath
                || (definitionIcon?.type === 'image' ? definitionIcon.path : null)
                || null,
            icon: weapon.icon
                || (typeof itemDefinition?.icon === 'string' ? itemDefinition.icon : '')
                || definitionIcon?.fallbackEmoji
                || ''
        };

        const detailSourcePlayer = this.game.localPlayer || {
            getWeaponAffixEffectiveValue: () => 0,
            getWeaponAffixEnhancementBonus: () => 0,
            getWeaponCombatHookValue: () => 0
        };
        const detail = this.buildInventoryDetail(detailSourcePlayer, displayWeapon);
        return {
            displayWeapon,
            title: detail.title || displayWeapon.name,
            subtitle: detail.subtitle || itemDefinition?.category || itemDefinition?.weaponType || displayWeapon.slot || '무기',
            description: detail.description || '',
            lines: this.mergeInventoryEnhancementBonusLines(detail.lines).filter(Boolean)
        };
    }

    ensureFriendWeaponTooltip() {
        let tooltip = document.getElementById('friend-weapon-tooltip');
        if (tooltip) return tooltip;

        tooltip = document.createElement('div');
        tooltip.id = 'friend-weapon-tooltip';
        tooltip.className = 'friend-weapon-tooltip hidden';
        document.body.appendChild(tooltip);
        return tooltip;
    }

    showFriendWeaponTooltip(weaponData, anchorEl) {
        if (!weaponData || !anchorEl) return;

        const tooltip = this.ensureFriendWeaponTooltip();
        tooltip.innerHTML = '';

        const card = document.createElement('div');
        card.className = 'friend-weapon-tooltip-card';

        const head = document.createElement('div');
        head.className = 'inventory-detail-head';

        const titleBlock = document.createElement('div');
        titleBlock.className = 'inventory-detail-title-block';

        const titleEl = document.createElement('h3');
        titleEl.textContent = weaponData.title;
        titleBlock.appendChild(titleEl);

        if (weaponData.subtitle) {
            const subtitleEl = document.createElement('p');
            subtitleEl.textContent = weaponData.subtitle;
            titleBlock.appendChild(subtitleEl);
        }

        head.appendChild(titleBlock);
        card.appendChild(head);

        if (weaponData.description) {
            const descEl = document.createElement('p');
            descEl.className = 'inventory-detail-desc';
            descEl.textContent = weaponData.description;
            card.appendChild(descEl);
        }

        if (weaponData.lines?.length) {
            const statsEl = document.createElement('ul');
            statsEl.className = 'inventory-detail-stats';
            weaponData.lines.forEach((line) => {
                statsEl.appendChild(this.createInventoryDetailStatLineElement(line));
            });
            card.appendChild(statsEl);
        }

        tooltip.appendChild(card);
        tooltip.classList.remove('hidden');
        this.friendWeaponTooltipAnchor = anchorEl;
        this.positionFriendWeaponTooltip(anchorEl);
    }

    positionFriendWeaponTooltip(anchorEl = this.friendWeaponTooltipAnchor) {
        const tooltip = document.getElementById('friend-weapon-tooltip');
        const card = tooltip?.querySelector('.friend-weapon-tooltip-card');
        if (!tooltip || !card || tooltip.classList.contains('hidden') || !anchorEl?.isConnected) return;

        const anchorRect = anchorEl.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const gap = 10;
        const margin = 12;
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

        let left = anchorRect.right + gap;
        if ((left + cardRect.width) > (viewportWidth - margin)) {
            left = anchorRect.left - cardRect.width - gap;
        }
        left = Math.max(margin, Math.min(left, viewportWidth - cardRect.width - margin));

        let top = anchorRect.top + ((anchorRect.height - cardRect.height) / 2);
        top = Math.max(margin, Math.min(top, viewportHeight - cardRect.height - margin));

        tooltip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    }

    hideFriendWeaponTooltip() {
        const tooltip = document.getElementById('friend-weapon-tooltip');
        if (!tooltip) return;

        tooltip.classList.add('hidden');
        tooltip.innerHTML = '';
        tooltip.style.removeProperty('transform');
        this.friendWeaponTooltipAnchor = null;
    }

    renderSelectedFriendDetail(friends = []) {
        this.hideFriendWeaponTooltip();
        this.syncFriendsPopupLayout();

        const emptyEl = document.getElementById('friend-profile-empty');
        const panelEl = document.getElementById('friend-profile-panel');
        const selected = friends.find((entry) => entry.uid === this.selectedFriendUid) || null;

        if (!selected || !panelEl || !emptyEl) {
            emptyEl?.classList.remove('hidden');
            panelEl?.classList.add('hidden');
            return;
        }

        const profile = this.friendProfileCache.get(selected.uid) || null;
        const displayName = profile?.name || selected.name || selected.uid;
        const meta = this.getFriendThreadMeta(selected.uid);
        const avatarEl = document.getElementById('friend-profile-avatar');
        const nameEl = document.getElementById('friend-profile-name');
        const statusEl = document.getElementById('friend-profile-status');
        const metaEl = document.getElementById('friend-profile-meta');
        const summaryEl = document.getElementById('friend-profile-summary');
        const statsEl = document.getElementById('friend-profile-stats');
        const weaponEl = document.getElementById('friend-profile-weapon');
        const togetherBtn = document.getElementById('friend-profile-together-btn');

        emptyEl.classList.add('hidden');
        panelEl.classList.remove('hidden');

        if (avatarEl) avatarEl.textContent = this.getFriendAvatarText(displayName);
        if (nameEl) nameEl.textContent = displayName;
        if (statusEl) {
            statusEl.textContent = this.getFriendStatusText(selected.online);
            statusEl.classList.toggle('is-online', !!selected.online);
        }
        if (metaEl) {
            metaEl.textContent = `ID ${selected.uid}`;
        }
        if (togetherBtn) {
            togetherBtn.disabled = !selected.online;
        }

        if (summaryEl) {
            const parts = [
                `최근 메시지 ${meta?.lastMessage || '아직 없음'}`,
                meta?.updatedAt ? `대화 시각 ${this.formatFriendTime(meta.updatedAt)}` : '대화 이력 없음',
                selected.online ? '지금 함께하기 가능' : '오프라인'
            ];
            summaryEl.innerHTML = parts.map((text) => `<span>${this.escapeHtml(text)}</span>`).join('');
        }

        if (!profile) {
            if (statsEl) {
                statsEl.innerHTML = '<div class="friend-profile-loading">프로필을 불러오는 중입니다.</div>';
            }
            if (weaponEl) {
                weaponEl.innerHTML = '<div class="friend-profile-loading">장착 무기를 확인하는 중입니다.</div>';
            }
            return;
        }

        const derived = this.buildFriendDerivedStats(profile);
        if (statsEl) {
            statsEl.innerHTML = `
                <div class="friends-profile-stat-card"><strong>레벨</strong><span>${derived.level}</span></div>
                <div class="friends-profile-stat-card"><strong>HP / MP</strong><span>${Math.floor(derived.hp)} / ${Math.floor(derived.maxHp)} | ${Math.floor(derived.mp)} / ${Math.floor(derived.maxMp)}</span></div>
                <div class="friends-profile-stat-card"><strong>기본 스탯</strong><span>VIT ${derived.vitality} / INT ${derived.intelligence} / WIS ${derived.wisdom} / AGI ${derived.agility}</span></div>
                <div class="friends-profile-stat-card"><strong>전투 수치</strong><span>공격력 ${derived.attack} / 방어력 ${derived.defense}</span></div>
                <div class="friends-profile-stat-card"><strong>공격속도</strong><span>${derived.attackSpeed.toFixed(2)}</span></div>
                <div class="friends-profile-stat-card"><strong>치명확률</strong><span>${Math.round(derived.critRate * 100)}%</span></div>
            `;
        }

        this.renderFriendProfileWeapon(weaponEl, profile);
    }

    renderFriendProfileWeapon(weaponEl, profile = {}) {
        if (!weaponEl) return;

        weaponEl.innerHTML = '';
        const weaponData = this.getFriendWeaponDisplayData(profile?.equipment?.weapon || null);
        const weaponCard = document.createElement('div');
        weaponCard.className = 'friend-weapon-card';

        if (!weaponData) {
            weaponCard.innerHTML = `
                <div class="friend-weapon-head">
                    <div class="friend-weapon-empty">-</div>
                    <div class="friend-weapon-meta">
                        <span class="friend-weapon-name">장착 중인 무기 없음</span>
                        <span class="friend-weapon-help">현재 장착한 무기가 없습니다.</span>
                    </div>
                </div>
            `;
            weaponEl.appendChild(weaponCard);
            return;
        }

        const rowEl = document.createElement('div');
        rowEl.className = 'friend-weapon-head';

        const iconButton = document.createElement('button');
        iconButton.type = 'button';
        iconButton.className = 'friend-weapon-icon-button';
        iconButton.setAttribute('aria-label', `${weaponData.title} 상세 보기`);
        iconButton.title = `${weaponData.title} 상세 보기`;
        iconButton.appendChild(this.createInventoryIconElement(weaponData.displayWeapon, 'friend-weapon-icon'));

        const showTooltip = () => this.showFriendWeaponTooltip(weaponData, iconButton);
        iconButton.addEventListener('mouseenter', showTooltip);
        iconButton.addEventListener('focus', showTooltip);
        iconButton.addEventListener('mouseleave', () => this.hideFriendWeaponTooltip());
        iconButton.addEventListener('blur', () => this.hideFriendWeaponTooltip());
        iconButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const tooltip = document.getElementById('friend-weapon-tooltip');
            const isOpen = tooltip && !tooltip.classList.contains('hidden') && this.friendWeaponTooltipAnchor === iconButton;
            if (isOpen) {
                this.hideFriendWeaponTooltip();
            } else {
                this.showFriendWeaponTooltip(weaponData, iconButton);
            }
        });

        const metaEl = document.createElement('div');
        metaEl.className = 'friend-weapon-meta';
        metaEl.innerHTML = `
            <span class="friend-weapon-name">${this.escapeHtml(weaponData.title)}</span>
            <span class="friend-weapon-help">${this.escapeHtml(weaponData.subtitle || '무기')}</span>
        `;

        rowEl.appendChild(iconButton);
        rowEl.appendChild(metaEl);
        weaponCard.appendChild(rowEl);
        weaponEl.appendChild(weaponCard);
    }

    refreshFriendsPopup() {
        const friends = this.game.net?.getFriendListSnapshot?.() || [];
        const countEl = document.getElementById('friends-count');
        if (countEl) {
            countEl.textContent = `${friends.length}명`;
        }

        if (this.selectedFriendUid && !friends.some((entry) => entry.uid === this.selectedFriendUid)) {
            const removedUid = this.selectedFriendUid;
            this.selectedFriendUid = null;
            if (this.friendChatUid === removedUid) {
                this.closeFriendChat({ detachThread: true, keepSelection: false, silent: true });
            }
        }

        const entries = this.buildSortedFriendEntries(friends);
        this.refreshFriendThreadList(entries);
        this.renderSelectedFriendDetail(friends);
        this.syncFriendsPopupLayout();

        if (this.friendChatUid && !document.getElementById('friend-chat-modal')?.classList.contains('hidden')) {
            this.renderFriendChatMessages();
        }

        const hasUnread = entries.some((entry) => entry.unread);
        this.setFriendsAlertActive(!this.isPopupOpen('friends-popup') && hasUnread);
    }
}
