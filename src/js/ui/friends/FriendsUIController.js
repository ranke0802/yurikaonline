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
        const chatProfileModal = document.getElementById('friend-chat-profile-modal');
        const chatCard = document.getElementById('friend-chat-card');
        const chatHeader = document.getElementById('friend-chat-header');
        const searchInput = document.getElementById('friend-search-query-input');
        const searchBtn = document.getElementById('friend-search-query-btn');
        const searchAddBtn = document.getElementById('friend-search-add-btn');
        const togetherBtn = document.getElementById('friend-profile-together-btn');
        const chatBtn = document.getElementById('friend-profile-chat-btn');
        const giftBtn = document.getElementById('friend-profile-gift-btn');
        const removeBtn = document.getElementById('friend-profile-remove-btn');
        const chatTogetherBtn = document.getElementById('friend-chat-together-btn');
        const chatCompactBtn = document.getElementById('friend-chat-compact-btn');
        const chatMinimizeBtn = document.getElementById('friend-chat-minimize-btn');
        const chatAvatarBtn = document.getElementById('friend-chat-avatar-btn');
        const chatSendBtn = document.getElementById('friend-chat-send-btn');
        const chatInput = document.getElementById('friend-chat-input');
        const chatMessages = document.getElementById('friend-chat-messages');
        const chatGiftToggleBtn = document.getElementById('friend-chat-gift-toggle-btn');
        const chatOpacitySlider = document.getElementById('friend-chat-opacity-slider');
        const giftKindManastoneBtn = document.getElementById('friend-gift-kind-manastone');
        const giftKindItemBtn = document.getElementById('friend-gift-kind-item');
        const giftItemPickerBtn = document.getElementById('friend-gift-item-picker-btn');
        const giftItemAmountInput = document.getElementById('friend-gift-item-amount');
        const giftManastoneAmountInput = document.getElementById('friend-gift-manastone-amount');
        const giftSendBtn = document.getElementById('friend-gift-send-btn');
        const chatProfileTogetherBtn = document.getElementById('friend-chat-profile-together-btn');
        const chatProfileChatBtn = document.getElementById('friend-chat-profile-chat-btn');
        const chatProfileGiftBtn = document.getElementById('friend-chat-profile-gift-btn');
        const chatProfileRemoveBtn = document.getElementById('friend-chat-profile-remove-btn');

        const openSearchModal = () => this.toggleFriendSearchModal(true);
        const closeSearchModal = () => this.toggleFriendSearchModal(false);
        const resolveProfileTargetUid = () => this.friendChatProfileUid || this.friendChatUid || this.selectedFriendUid;

        this.ensureFriendChatWindowState();
        this.ensureFriendChatDragBinding(chatHeader, chatCard);
        this.ensureFriendChatResizeBinding(chatCard);
        this.ensureFriendChatViewportBinding();
        this.ensureFriendPresenceRefreshTicker();
        this.ensureFriendPortraitAsset().then(() => {
            this.refreshFriendsPopup();
            this.renderFriendSearchResult();
            this.renderFriendChatMessages();
            this.syncFriendChatOpacityUi();
        }).catch(() => { });

        document.getElementById('friend-open-search-btn')?.addEventListener('click', openSearchModal);
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
            if (this.isFriendChatCompactMode()) return;
            if (event.target === chatModal || event.target?.classList?.contains('friends-floating-scrim')) {
                this.closeFriendChat();
            }
        });

        chatProfileModal?.addEventListener('click', (event) => {
            if (event.target === chatProfileModal || event.target?.classList?.contains('friends-floating-scrim')) {
                this.toggleFriendChatProfileModal(false);
            }
        });
        document.getElementById('friend-chat-profile-close-btn')?.addEventListener('click', () => this.toggleFriendChatProfileModal(false));

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
                await this.openFriendChat(targetUid);
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
            await this.selectFriend(result.uid, { showProfile: false });
            this.setFriendsMobileView('list', { force: true });
            this.refreshFriendsPopup();
        });

        const runTogetherRequest = async (targetUid = this.selectedFriendUid || this.friendChatUid) => {
            if (!targetUid || !this.game.net) return;
            const result = await this.game.net.requestTogether(targetUid);
            const messages = {
                SENT: '함께하기 요청을 보냈습니다.',
                SELF: '자기 자신에게는 요청할 수 없습니다.',
                NOT_FRIEND: '친구에게만 함께하기를 요청할 수 있습니다.',
                OFFLINE: '상대가 현재 접속 중이 아닙니다.',
                BUSY: '이미 함께 플레이 중입니다. 현재 함께하기를 먼저 종료해 주세요.',
                ERROR: '함께하기 요청 중 오류가 발생했습니다.'
            };
            this.showGenericModal('함께하기', messages[result] || '처리할 수 없습니다.', null, null, { hideNo: true, yesText: '확인' });
        };

        const runRemoveFriend = (targetUid = this.selectedFriendUid || this.friendChatUid) => {
            if (!targetUid || !this.game.net) return;
            const friendUid = targetUid;
            const friend = (this.game.net?.getFriendListSnapshot?.() || []).find((entry) => entry.uid === friendUid) || null;
            const friendName = friend?.name || this.getSelectedFriendName() || friendUid;
            this.showConfirm(`"${friendName}" 님을 친구 목록에서 삭제할까요?`, async (confirmed) => {
                if (!confirmed) return;
                await this.game.net.removeFriend(friendUid);
                this.toggleFriendChatProfileModal(false);
                if (this.friendChatUid === friendUid) {
                    this.closeFriendChat({ detachThread: true, keepSelection: false, silent: true });
                }
                this.selectedFriendUid = null;
                this.setFriendsMobileView('list', { force: true });
                this.refreshFriendsPopup();
            });
        };

        togetherBtn?.addEventListener('click', () => runTogetherRequest(this.selectedFriendUid));
        chatTogetherBtn?.addEventListener('click', () => runTogetherRequest(this.friendChatUid || this.selectedFriendUid));
        chatProfileTogetherBtn?.addEventListener('click', () => runTogetherRequest(resolveProfileTargetUid()));

        chatBtn?.addEventListener('click', () => {
            if (!this.selectedFriendUid) return;
            this.openFriendChat(this.selectedFriendUid);
        });
        chatProfileChatBtn?.addEventListener('click', () => {
            const targetUid = resolveProfileTargetUid();
            this.toggleFriendChatProfileModal(false);
            if (!this.friendChatUid && targetUid) {
                this.openFriendChat(targetUid);
                return;
            }
        });

        giftBtn?.addEventListener('click', () => {
            if (!this.selectedFriendUid) return;
            this.openFriendChat(this.selectedFriendUid, { openGift: true });
        });
        chatProfileGiftBtn?.addEventListener('click', () => {
            const targetUid = resolveProfileTargetUid();
            this.toggleFriendChatProfileModal(false);
            if (!this.friendChatUid && targetUid) {
                this.openFriendChat(targetUid, { openGift: true });
                return;
            }
            if (this.friendChatUid) {
                this.setFriendGiftComposerVisible(true);
            }
        });

        removeBtn?.addEventListener('click', () => runRemoveFriend(this.selectedFriendUid));
        chatProfileRemoveBtn?.addEventListener('click', () => runRemoveFriend(resolveProfileTargetUid()));

        document.getElementById('friend-chat-close-btn')?.addEventListener('click', () => this.closeFriendChat());
        document.getElementById('friend-chat-back-btn')?.addEventListener('click', () => this.handleFriendChatBackAction());
        chatCompactBtn?.addEventListener('click', () => {
            this.setFriendChatCompactMode(!this.isFriendChatCompactMode());
        });
        chatMinimizeBtn?.addEventListener('click', () => {
            this.toggleFriendChatMinimized();
        });
        chatAvatarBtn?.addEventListener('click', () => this.openFriendProfileFromChat());
        chatGiftToggleBtn?.addEventListener('click', () => {
            const composer = document.getElementById('friend-gift-composer');
            this.setFriendGiftComposerVisible(composer?.classList.contains('hidden'));
        });
        chatOpacitySlider?.addEventListener('input', (event) => {
            this.setFriendChatOpacity(event.currentTarget?.value);
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
            this.renderFriendChatMessages({ forceToLatest: true });
        });

        chatInput?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' || event.shiftKey) return;
            event.preventDefault();
            chatSendBtn?.click();
        });
        chatInput?.addEventListener('pointerdown', (event) => {
            if (chatInput.dataset.deferFocus !== 'true') return;
            event.preventDefault();
            this.syncFriendChatInputActivation({ deferred: false, focus: true });
        });
        chatInput?.addEventListener('focus', () => {
            if (chatInput.dataset.deferFocus === 'true') {
                this.syncFriendChatInputActivation({ deferred: false, focus: true });
            }
        });

        giftKindManastoneBtn?.addEventListener('click', () => this.setFriendGiftKind('manastone'));
        giftKindItemBtn?.addEventListener('click', () => this.setFriendGiftKind('item'));
        document.getElementById('friend-gift-cancel-btn')?.addEventListener('click', () => this.setFriendGiftComposerVisible(false));
        giftItemPickerBtn?.addEventListener('click', () => {
            const picker = document.getElementById('friend-gift-item-picker');
            this.toggleFriendGiftItemPicker(picker?.classList.contains('hidden'));
        });
        giftItemAmountInput?.addEventListener('input', () => this.refreshFriendGiftOptions());
        giftManastoneAmountInput?.addEventListener('input', () => this.refreshFriendGiftOptions());

        giftSendBtn?.addEventListener('click', async () => {
            const targetUid = this.friendChatUid || this.selectedFriendUid;
            if (!targetUid || !this.game.net) return;

            let result = null;
            if (this.friendGiftKind === 'item') {
                const selection = this.resolveFriendGiftSelection();
                const inventoryIndex = Number(selection?.index ?? -1);
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
            this.friendGiftSelection = null;
            this.refreshFriendGiftOptions();
            this.renderFriendChatMessages({ forceToLatest: true });
        });

        chatMessages?.addEventListener('click', async (event) => {
            const avatarButton = event.target?.closest?.('[data-friend-avatar-open-profile]');
            if (avatarButton) {
                event.preventDefault();
                await this.openFriendProfileFromChat({ uid: avatarButton.getAttribute('data-friend-avatar-open-profile') || undefined });
                return;
            }

            const giftItemButton = event.target?.closest?.('[data-friend-gift-item-message-id], [data-friend-gift-preview-index]');
            if (giftItemButton) {
                event.preventDefault();
                this.toggleFriendGiftItemDetailFromElement(giftItemButton);
                return;
            }

            const cancelButton = event.target?.closest?.('[data-cancel-gift-id]');
            if (cancelButton && this.friendChatUid && this.game.net) {
                const messageId = cancelButton.getAttribute('data-cancel-gift-id');
                if (!messageId) return;
                cancelButton.disabled = true;
                const result = await this.game.net.cancelFriendGift(this.friendChatUid, messageId);
                if (!result.ok) {
                    const messages = {
                        invalid_cancel: '회수할 수 없는 선물입니다.',
                        invalid_thread: '대화 정보를 다시 불러와 주세요.',
                        gift_missing: '선물 정보를 찾지 못했습니다.',
                        not_sender: '내가 보낸 선물만 취소할 수 있습니다.',
                        already_processed: '이미 처리된 선물입니다.'
                    };
                    this.showGenericModal('선물 회수', messages[result.reason] || '선물 회수 중 오류가 발생했습니다.', null, null, { hideNo: true, yesText: '확인' });
                }
                this.renderFriendChatMessages();
                this.refreshFriendsPopup();
                return;
            }

            const rejectButton = event.target?.closest?.('[data-reject-gift-id]');
            if (rejectButton && this.friendChatUid && this.game.net) {
                const messageId = rejectButton.getAttribute('data-reject-gift-id');
                if (!messageId) return;
                rejectButton.disabled = true;
                const result = await this.game.net.rejectFriendGift(this.friendChatUid, messageId);
                if (!result.ok) {
                    const messages = {
                        invalid_reject: '거절할 수 없는 선물입니다.',
                        invalid_thread: '대화 정보를 다시 불러와 주세요.',
                        gift_missing: '선물 정보를 찾지 못했습니다.',
                        not_recipient: '내가 받은 선물만 거절할 수 있습니다.',
                        already_processed: '이미 처리된 선물입니다.'
                    };
                    this.showGenericModal('선물 거절', messages[result.reason] || '선물 거절 중 오류가 발생했습니다.', null, null, { hideNo: true, yesText: '확인' });
                }
                this.renderFriendChatMessages();
                this.refreshFriendsPopup();
                return;
            }

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
                    const chatOpen = !document.getElementById('friend-chat-modal')?.classList.contains('hidden');
                    const forceToLatest = chatOpen && !this.isFriendChatMinimized();
                    this.renderFriendChatMessages({ uid: data.uid, forceToLatest });
                }
            });
            this.game.net.on('friendMessageReceived', (data) => {
                const friendUid = data?.friendUid || data?.fromUid || null;
                const chatOpen = !document.getElementById('friend-chat-modal')?.classList.contains('hidden');
                const isMinimized = this.isFriendChatMinimized();
                const isActiveChat = !!friendUid && chatOpen && !isMinimized && this.friendChatUid === friendUid;

                if (data?.kind === 'thread') {
                    if (!isActiveChat) {
                        const senderName = data?.fromName || '친구';
                        this.logSystemMessage(`[친구] ${senderName}님의 새 메시지가 도착했습니다.`);
                    } else if (this.game.net?.markFriendThreadRead) {
                        this.game.net.markFriendThreadRead(friendUid).catch(() => { });
                    }
                } else if (data?.kind === 'gift_refund') {
                    const senderName = data?.fromName || '친구';
                    this.logSystemMessage(`[친구] ${senderName}님이 선물을 거절해 돌려받았습니다.`);
                } else if (data?.kind === 'gift_status' && data?.action === 'canceled') {
                    const senderName = data?.fromName || '친구';
                    this.logSystemMessage(`[친구] ${senderName}님이 선물을 회수했습니다.`);
                } else {
                    const senderName = data?.fromName || '친구';
                    this.logSystemMessage(`[친구 메시지] ${senderName}: ${data?.text || ''}`);
                }

                if (friendUid && chatOpen && this.friendChatUid === friendUid && isMinimized) {
                    this.setFriendChatUnreadWhileMinimized(true);
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

    ensureFriendChatWindowState() {
        if (!this.friendChatWindowState || typeof this.friendChatWindowState !== 'object') {
            this.friendChatWindowState = {
                compact: false,
                minimized: false,
                unreadWhileMinimized: false,
                retainOnPopupToggle: false,
                restoreFriendsPopupOnClose: false,
                requestedUid: null,
                viewportPreset: null,
                scale: 1,
                width: null,
                height: null,
                left: null,
                top: null
            };
        }
        this.friendChatWindowState.restoreFriendsPopupOnClose = !!this.friendChatWindowState.restoreFriendsPopupOnClose;
        this.friendChatWindowState.requestedUid = this.friendChatWindowState.requestedUid
            ? String(this.friendChatWindowState.requestedUid)
            : null;
        this.friendChatWindowState.viewportPreset = this.friendChatWindowState.viewportPreset
            ? String(this.friendChatWindowState.viewportPreset)
            : null;
        this.friendChatWindowState.scale = Math.min(1.5, Math.max(0.5, Number(this.friendChatWindowState.scale) || 1));
        this.friendChatWindowState.width = Number.isFinite(Number(this.friendChatWindowState.width))
            ? Number(this.friendChatWindowState.width)
            : null;
        this.friendChatWindowState.height = Number.isFinite(Number(this.friendChatWindowState.height))
            ? Number(this.friendChatWindowState.height)
            : null;
        this.friendChatWindowState.left = Number.isFinite(Number(this.friendChatWindowState.left))
            ? Number(this.friendChatWindowState.left)
            : null;
        this.friendChatWindowState.top = Number.isFinite(Number(this.friendChatWindowState.top))
            ? Number(this.friendChatWindowState.top)
            : null;
        return this.friendChatWindowState;
    }

    isFriendChatCompactMode() {
        return !!this.ensureFriendChatWindowState().compact;
    }

    isFriendChatMinimized() {
        const state = this.ensureFriendChatWindowState();
        return !!state.compact && !!state.minimized;
    }

    setFriendChatUnreadWhileMinimized(active) {
        const state = this.ensureFriendChatWindowState();
        state.unreadWhileMinimized = !!active;
        this.applyFriendChatWindowState();
    }

    applyFriendChatWindowState() {
        const modal = document.getElementById('friend-chat-modal');
        const card = document.getElementById('friend-chat-card');
        const body = document.getElementById('friend-chat-body');
        const scrim = modal?.querySelector('.friends-floating-scrim');
        const compactBtn = document.getElementById('friend-chat-compact-btn');
        const minimizeBtn = document.getElementById('friend-chat-minimize-btn');
        const backBtn = document.getElementById('friend-chat-back-btn');
        const togetherBtn = document.getElementById('friend-chat-together-btn');
        const unreadDot = document.getElementById('friend-chat-unread-dot');
        const statusDot = document.getElementById('friend-chat-status-dot');
        const titleEl = document.getElementById('friend-chat-title');
        const state = this.ensureFriendChatWindowState();
        const viewportPreset = this.getFriendChatCompactViewportPreset();
        const viewportChanged = state.viewportPreset !== viewportPreset.id;

        if (!modal || !card) return;

        modal.classList.toggle('is-compact', !!state.compact);
        modal.classList.toggle('is-minimized', !!state.compact && !!state.minimized);
        card.classList.toggle('is-compact', !!state.compact);
        card.classList.toggle('is-minimized', !!state.compact && !!state.minimized);
        body?.classList.toggle('hidden', !!state.compact && !!state.minimized);
        scrim?.classList.toggle('hidden', !!state.compact);
        unreadDot?.classList.toggle('hidden', !state.unreadWhileMinimized);

        if (state.compact) {
            state.viewportPreset = viewportPreset.id;
            if (viewportChanged) {
                state.scale = 1;
                state.left = null;
                state.top = null;
            }
            const sizeBounds = this.getFriendChatSizeBounds({ preset: viewportPreset });
            const fallbackWidth = state.minimized ? (card.offsetWidth || 232) : viewportPreset.width;
            const fallbackHeight = state.minimized ? (card.offsetHeight || 96) : viewportPreset.height;
            const nextWidth = Math.min(sizeBounds.maxWidth, Math.max(sizeBounds.minWidth, Number(state.width) || fallbackWidth));
            const nextHeight = Math.min(sizeBounds.maxHeight, Math.max(sizeBounds.minHeight, Number(state.height) || fallbackHeight));
            state.width = nextWidth;
            state.height = nextHeight;
            state.scale = 1;
            card.style.setProperty('--friend-chat-compact-width', `${Math.round(nextWidth)}px`);
            card.style.setProperty('--friend-chat-compact-height', `${Math.round(nextHeight)}px`);
        } else {
            state.viewportPreset = null;
            card.style.removeProperty('--friend-chat-compact-width');
            card.style.removeProperty('--friend-chat-compact-height');
        }

        if (compactBtn) {
            compactBtn.classList.toggle('is-active', !!state.compact);
            compactBtn.querySelector('.friends-action-icon-compact')?.classList.toggle('hidden', !!state.compact);
            compactBtn.querySelector('.friends-action-icon-expand')?.classList.toggle('hidden', !state.compact);
            compactBtn.title = state.compact ? '전체 채팅으로 복구' : '채팅 소형화';
            compactBtn.setAttribute('aria-label', compactBtn.title);
            compactBtn.classList.toggle('hidden', !!state.compact && !!state.minimized);
        }
        togetherBtn?.setAttribute('aria-label', '함께하기');
        togetherBtn?.setAttribute('title', '함께하기');
        if (minimizeBtn) {
            const minimized = !!state.compact && !!state.minimized;
            minimizeBtn.querySelector('.friends-action-icon-minimize')?.classList.toggle('hidden', minimized);
            minimizeBtn.querySelector('.friends-action-icon-restore')?.classList.toggle('hidden', !minimized);
            minimizeBtn.title = minimized ? '채팅 복구' : '채팅 최소화';
            minimizeBtn.setAttribute('aria-label', minimizeBtn.title);
            minimizeBtn.classList.toggle('hidden', !state.compact);
        }
        statusDot?.classList.toggle('is-online', false);
        statusDot?.classList.toggle('is-offline', true);
        backBtn?.classList.toggle('is-compact-mode', !!state.compact);
        backBtn?.classList.toggle('hidden', !!state.compact && !!state.minimized && this.getFriendsPopupMode() === 'mobileLandscape');
        togetherBtn?.classList.toggle('hidden', !!state.compact && !!state.minimized);

        if (!state.compact) {
            delete card.dataset.preserveFloatingTransform;
            card.style.removeProperty('left');
            card.style.removeProperty('top');
            card.style.removeProperty('right');
            card.style.removeProperty('bottom');
            card.style.removeProperty('position');
            card.style.removeProperty('transform');
            card.style.removeProperty('transform-origin');
            card.style.removeProperty('margin');
        } else {
            card.dataset.preserveFloatingTransform = 'true';
            card.style.setProperty('position', 'fixed', 'important');
            card.style.setProperty('right', 'auto', 'important');
            card.style.setProperty('bottom', 'auto', 'important');
            card.style.setProperty('margin', '0', 'important');
            card.style.removeProperty('transform');
            card.style.removeProperty('transform-origin');

            if (!Number.isFinite(state.left) || !Number.isFinite(state.top)) {
                this.resetFriendChatCompactPosition(card, { preserveScale: true });
            } else {
                card.style.setProperty('left', `${Math.round(state.left)}px`, 'important');
                card.style.setProperty('top', `${Math.round(state.top)}px`, 'important');
                this.clampFloatingPanelToViewport?.(card);
                const rect = card.getBoundingClientRect();
                state.left = Math.round(rect.left);
                state.top = Math.round(rect.top);
            }
        }

        if (titleEl && this.friendChatUid && state.compact && state.minimized) {
            titleEl.textContent = this.getFriendDisplayName(this.friendChatUid);
        }

        if (!state.minimized && this.friendChatUid && this.game.net?.setActiveFriendThreadAutoRead) {
            this.game.net.setActiveFriendThreadAutoRead(true);
            this.game.net.markFriendThreadRead?.(this.friendChatUid)?.catch?.(() => { });
            state.unreadWhileMinimized = false;
            unreadDot?.classList.add('hidden');
        }

        if (state.compact && state.minimized) {
            this.toggleFriendGiftItemPicker(false);
        } else {
            this.positionFriendGiftItemPicker();
        }
    }

    handleFriendChatBackAction() {
        if (this.isFriendChatCompactMode()) {
            this.closeFriendChat({ detachThread: false, keepSelection: true, silent: true });
            if (!this.isPopupOpen('friends-popup')) {
                this.togglePopup('friends-popup');
            }
            this.setFriendsMobileView('list', { force: true });
            this.refreshFriendsPopup();
            return;
        }

        this.closeFriendChat({ detachThread: false, keepSelection: true });
    }

    async openFriendProfileFromChat(options = {}) {
        const uid = options.uid || this.friendChatUid || this.selectedFriendUid;
        if (!uid) return;

        this.selectedFriendUid = uid;
        await this.ensureFriendProfileLoaded(uid);
        this.friendChatProfileUid = uid;
        this.renderFriendChatProfileModal(uid);
        this.toggleFriendChatProfileModal(true, { uid });
    }

    setFriendChatCompactMode(compact, options = {}) {
        const state = this.ensureFriendChatWindowState();
        const nextCompact = !!compact;
        state.compact = nextCompact;
        if (!nextCompact) {
            state.minimized = false;
            state.unreadWhileMinimized = false;
        }

        if (nextCompact) {
            state.retainOnPopupToggle = true;
            if (this.isPopupOpen('friends-popup')) {
                this.togglePopup('friends-popup');
            }
            state.retainOnPopupToggle = false;
            this.game.net?.setActiveFriendThreadAutoRead?.(!state.minimized);
        } else {
            state.retainOnPopupToggle = true;
            if (!this.isPopupOpen('friends-popup')) {
                this.togglePopup('friends-popup');
            }
            state.retainOnPopupToggle = false;
            if (this.getFriendsPopupMode() !== 'desktop') {
                this.setFriendsMobileView('list', { force: true });
            }
            if (options.focusInput) {
                window.setTimeout(() => {
                    document.getElementById('friend-chat-input')?.focus();
                }, 0);
            }
        }

        this.applyFriendChatWindowState();
        this.renderFriendChatMessages({ forceToLatest: true });
    }

    toggleFriendChatMinimized(force) {
        if (!this.isFriendChatCompactMode()) return;

        const state = this.ensureFriendChatWindowState();
        state.minimized = typeof force === 'boolean' ? !!force : !state.minimized;
        if (!state.minimized) {
            state.unreadWhileMinimized = false;
        }
        this.game.net?.setActiveFriendThreadAutoRead?.(!state.minimized);
        this.applyFriendChatWindowState();
        this.renderFriendChatMessages({ forceToLatest: true });
    }

    scrollFriendChatToLatest(attempts = 3) {
        const container = document.getElementById('friend-chat-messages');
        if (!container) return;

        const remainingAttempts = Math.max(1, Math.floor(Number(attempts) || 1));
        const applyScroll = (remaining) => {
            container.scrollTop = container.scrollHeight;
            if (remaining <= 1) return;
            window.requestAnimationFrame(() => applyScroll(remaining - 1));
        };

        applyScroll(remainingAttempts);
    }

    ensureFriendChatDragBinding(header = document.getElementById('friend-chat-header'), card = document.getElementById('friend-chat-card')) {
        if (!header || !card || header.dataset.dragBound === 'true') return;

        header.dataset.dragBound = 'true';
        header.classList.add('draggable-panel-handle');
        header.addEventListener('pointerdown', (event) => {
            if (!this.isFriendChatCompactMode()) return;
            this.beginFloatingPanelDrag(event, card);
        });

        if (card.dataset.minimizedDragBound === 'true') return;
        card.dataset.minimizedDragBound = 'true';
        card.addEventListener('pointerdown', (event) => {
            if (!this.isFriendChatCompactMode() || !this.isFriendChatMinimized()) return;
            this.beginFloatingPanelDrag(event, card);
        });
    }

    ensureFriendChatViewportBinding() {
        if (this.friendChatViewportBound) return;

        this.friendChatViewportBound = true;
        window.addEventListener('resize', () => {
            if (document.getElementById('friend-chat-modal')?.classList.contains('hidden')) return;
            this.applyFriendChatWindowState();
            this.renderFriendChatMessages();
        });
    }

    getFriendChatVisualScale() {
        return 1;
    }

    shouldDeferFriendChatInputActivation() {
        return this.getFriendsPopupMode() === 'mobileLandscape';
    }

    syncFriendChatInputActivation(options = {}) {
        const {
            deferred = this.shouldDeferFriendChatInputActivation(),
            focus = false
        } = options;
        const input = document.getElementById('friend-chat-input');
        if (!input) return;

        const nextDeferred = !!deferred;
        if (nextDeferred) {
            if (!input.dataset.defaultPlaceholder) {
                input.dataset.defaultPlaceholder = input.getAttribute('placeholder') || '';
            }
            input.readOnly = true;
            input.dataset.deferFocus = 'true';
            input.classList.add('is-activation-deferred');
            input.setAttribute('placeholder', '메시지를 탭해 입력하세요.');
            input.blur();
            return;
        }

        input.readOnly = false;
        delete input.dataset.deferFocus;
        input.classList.remove('is-activation-deferred');
        if (input.dataset.defaultPlaceholder) {
            input.setAttribute('placeholder', input.dataset.defaultPlaceholder);
        }

        if (focus) {
            input.focus({ preventScroll: true });
            if (typeof input.setSelectionRange === 'function') {
                const caret = input.value.length;
                input.setSelectionRange(caret, caret);
            }
        }
    }

    getFriendChatCompactMargin() {
        return this.getFriendsPopupMode() === 'desktop' ? 16 : 8;
    }

    isFriendGiftComposerVisible() {
        const composer = document.getElementById('friend-gift-composer');
        return !!composer && !composer.classList.contains('hidden');
    }

    getFriendChatCompactViewportMode() {
        return this.getFriendsPopupMode() === 'desktop'
            ? 'desktop'
            : (this.isMobileLandscapeViewport() ? 'mobileLandscape' : 'mobilePortrait');
    }

    getFriendChatCompactViewportPreset(options = {}) {
        const mode = options.mode || this.getFriendChatCompactViewportMode();
        const isGiftOpen = typeof options.isGiftOpen === 'boolean'
            ? options.isGiftOpen
            : this.isFriendGiftComposerVisible();

        const presets = {
            desktop: {
                width: 344,
                height: 404,
                giftHeight: 474,
                minScale: 0.6,
                maxScale: 1.4,
                maxWidthRatio: 0.34,
                maxHeightRatio: 0.74
            },
            mobilePortrait: {
                width: 288,
                height: 304,
                giftHeight: 388,
                minScale: 0.7,
                maxScale: 1.2,
                maxWidthRatio: 0.84,
                maxHeightRatio: 0.6
            },
            mobileLandscape: {
                width: 276,
                height: 248,
                giftHeight: 332,
                minScale: 0.72,
                maxScale: 1.12,
                maxWidthRatio: 0.42,
                maxHeightRatio: 0.56
            }
        };

        const preset = presets[mode] || presets.desktop;
        return {
            id: mode,
            mode,
            width: preset.width,
            height: isGiftOpen ? preset.giftHeight : preset.height,
            minScale: preset.minScale,
            maxScale: preset.maxScale,
            maxWidthRatio: isGiftOpen ? Math.min(0.5, preset.maxWidthRatio + 0.04) : preset.maxWidthRatio,
            maxHeightRatio: isGiftOpen ? Math.min(0.7, preset.maxHeightRatio + 0.1) : preset.maxHeightRatio
        };
    }

    getFriendChatScaleBounds(baseWidth = 360, baseHeight = 500, options = {}) {
        const margin = this.getFriendChatCompactMargin();
        const preset = options.preset || this.getFriendChatCompactViewportPreset(options);
        const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
        const minScale = Math.max(0.5, Math.min(1, Number(preset.minScale) || 0.5));
        const maxScale = Math.max(minScale, Math.min(1.5, Number(preset.maxScale) || 1.5));
        const maxWidth = Math.max(180, Math.min(viewportW - margin * 2, viewportW * (Number(preset.maxWidthRatio) || 1)));
        const maxHeight = Math.max(160, Math.min(viewportH - margin * 2, viewportH * (Number(preset.maxHeightRatio) || 1)));
        const fitScale = Math.min(
            maxScale,
            Math.max(minScale, maxWidth / Math.max(1, baseWidth)),
            Math.max(minScale, maxHeight / Math.max(1, baseHeight))
        );
        return {
            min: minScale,
            max: Math.max(minScale, fitScale)
        };
    }

    getFriendChatSizeBounds(options = {}) {
        const margin = this.getFriendChatCompactMargin();
        const preset = options.preset || this.getFriendChatCompactViewportPreset(options);
        const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
        const minWidth = Math.max(220, Math.round((Number(preset.width) || 320) * 0.5));
        const minHeight = Math.max(180, Math.round((Number(preset.height) || 360) * 0.5));
        const maxWidth = Math.max(minWidth, Math.min(viewportW - margin * 2, Math.round((Number(preset.width) || 320) * 1.5)));
        const maxHeight = Math.max(minHeight, Math.min(viewportH - margin * 2, Math.round((Number(preset.height) || 360) * 1.5)));
        return {
            minWidth,
            maxWidth,
            minHeight,
            maxHeight
        };
    }

    resetFriendChatCompactPosition(card = document.getElementById('friend-chat-card'), options = {}) {
        if (!card) return;

        const state = this.ensureFriendChatWindowState();
        const margin = this.getFriendChatCompactMargin();
        const bottomInset = this.getFriendsPopupMode() === 'desktop'
            ? margin
            : margin + (window.visualViewport ? Math.max(0, window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop) : 0);

        if (!options.preserveScale) {
            card.style.removeProperty('transform');
            card.style.removeProperty('transform-origin');
        }

        const rect = card.getBoundingClientRect();
        const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
        const nextLeft = Math.max(margin, Math.round(viewportW - rect.width - margin));
        const nextTop = Math.max(margin, Math.round(viewportH - rect.height - bottomInset));
        state.left = nextLeft;
        state.top = nextTop;
        card.style.setProperty('left', `${nextLeft}px`, 'important');
        card.style.setProperty('top', `${nextTop}px`, 'important');
    }

    ensureFriendChatResizeBinding(card = document.getElementById('friend-chat-card')) {
        if (!card || card.dataset.resizeBound === 'true') return;

        card.dataset.resizeBound = 'true';
        card.querySelectorAll('[data-friend-chat-resize]').forEach((handle) => {
            handle.addEventListener('pointerdown', (event) => {
                this.beginFriendChatResize(event, handle.dataset.friendChatResize, card);
            });
        });

        if (!this.friendChatResizePointerBound) {
            this.friendChatResizePointerBound = true;
            this.handleFriendChatResizePointerMoveBound = this.handleFriendChatResizePointerMove.bind(this);
            this.handleFriendChatResizePointerUpBound = this.handleFriendChatResizePointerUp.bind(this);
            document.addEventListener('pointermove', this.handleFriendChatResizePointerMoveBound, { passive: false });
            document.addEventListener('pointerup', this.handleFriendChatResizePointerUpBound, true);
            document.addEventListener('pointercancel', this.handleFriendChatResizePointerUpBound, true);
        }
    }

    beginFriendChatResize(event, handle = 'bottom-right', card = document.getElementById('friend-chat-card')) {
        if (!card || !this.isFriendChatCompactMode() || this.isFriendChatMinimized()) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;

        event.preventDefault();
        event.stopPropagation();

        const state = this.ensureFriendChatWindowState();
        const rect = card.getBoundingClientRect();
        const baseWidth = rect.width;
        const baseHeight = rect.height;

        this.friendChatResizeState = {
            active: true,
            pointerId: event.pointerId,
            handle,
            card,
            baseWidth,
            baseHeight,
            startLeft: rect.left,
            startTop: rect.top,
            startRight: rect.right,
            startBottom: rect.bottom,
            captureTarget: event.currentTarget || card
        };

        this.friendChatResizeState.captureTarget?.setPointerCapture?.(event.pointerId);
        card.classList.add('friends-chat-card-resizing');
        this.positionFriendGiftItemPicker();
    }

    handleFriendChatResizePointerMove(event) {
        const resizeState = this.friendChatResizeState;
        if (!resizeState?.active) return;
        if (resizeState.pointerId != null && event.pointerId !== resizeState.pointerId) return;

        const { card, handle, baseWidth, baseHeight } = resizeState;
        if (!card?.isConnected) {
            this.handleFriendChatResizePointerUp();
            return;
        }

        event.preventDefault();

        let targetWidth = baseWidth;
        let targetHeight = baseHeight;
        if (handle === 'top-left') {
            targetWidth = resizeState.startRight - event.clientX;
            targetHeight = resizeState.startBottom - event.clientY;
        } else if (handle === 'top-right') {
            targetWidth = event.clientX - resizeState.startLeft;
            targetHeight = resizeState.startBottom - event.clientY;
        } else if (handle === 'bottom-left') {
            targetWidth = resizeState.startRight - event.clientX;
            targetHeight = event.clientY - resizeState.startTop;
        } else {
            targetWidth = event.clientX - resizeState.startLeft;
            targetHeight = event.clientY - resizeState.startTop;
        }

        const sizeBounds = this.getFriendChatSizeBounds({
            preset: this.getFriendChatCompactViewportPreset()
        });
        const width = Math.min(sizeBounds.maxWidth, Math.max(sizeBounds.minWidth, targetWidth));
        const height = Math.min(sizeBounds.maxHeight, Math.max(sizeBounds.minHeight, targetHeight));

        let nextLeft = resizeState.startLeft;
        let nextTop = resizeState.startTop;
        if (handle === 'top-left') {
            nextLeft = resizeState.startRight - width;
            nextTop = resizeState.startBottom - height;
        } else if (handle === 'top-right') {
            nextTop = resizeState.startBottom - height;
        } else if (handle === 'bottom-left') {
            nextLeft = resizeState.startRight - width;
        }

        const clamped = this.clampFloatingPanelPosition(nextLeft, nextTop, width, height, this.getFriendChatCompactMargin());
        const state = this.ensureFriendChatWindowState();
        state.scale = 1;
        state.width = width;
        state.height = height;
        state.left = clamped.left;
        state.top = clamped.top;

        card.style.setProperty('--friend-chat-compact-width', `${Math.round(width)}px`);
        card.style.setProperty('--friend-chat-compact-height', `${Math.round(height)}px`);
        card.style.removeProperty('transform');
        card.style.removeProperty('transform-origin');
        card.style.setProperty('left', `${clamped.left}px`, 'important');
        card.style.setProperty('top', `${clamped.top}px`, 'important');
        this.positionFriendGiftItemPicker();
    }

    handleFriendChatResizePointerUp(event) {
        const resizeState = this.friendChatResizeState;
        if (!resizeState?.active) return;
        if (resizeState.pointerId != null && event?.pointerId !== undefined && event.pointerId !== resizeState.pointerId) return;

        resizeState.captureTarget?.releasePointerCapture?.(resizeState.pointerId);
        resizeState.card?.classList.remove('friends-chat-card-resizing');
        this.friendChatResizeState = null;
        this.applyFriendChatWindowState();
    }

    ensureFriendPresenceRefreshTicker() {
        if (this.friendPresenceRefreshTicker) return;

        this.friendPresenceRefreshTicker = window.setInterval(() => {
            const popupOpen = this.isPopupOpen('friends-popup');
            const chatOpen = !document.getElementById('friend-chat-modal')?.classList.contains('hidden');
            if (!popupOpen && !chatOpen) return;

            this.refreshFriendsPopup();
            if (this.friendChatUid && chatOpen) {
                this.renderFriendChatMessages();
            }
        }, 1000);
    }

    async ensureFriendPortraitAsset() {
        if (this.friendPortraitDataUrl) return this.friendPortraitDataUrl;
        if (this.friendPortraitPromise) return this.friendPortraitPromise;

        this.friendPortraitPromise = (async () => {
            try {
                const sheetCanvas = await this.game.resources?.loadCharacterSpriteSheet?.();
                if (!sheetCanvas) return '';

                const targetW = 96;
                const targetH = 96;
                const frameWidth = Math.floor(sheetCanvas.width / 8);
                const frameHeight = Math.floor(sheetCanvas.height / 5);
                const portraitCanvas = document.createElement('canvas');
                portraitCanvas.width = targetW;
                portraitCanvas.height = targetH;

                const ctx = portraitCanvas.getContext('2d');
                if (!ctx) return '';
                ctx.imageSmoothingEnabled = false;
                ctx.clearRect(0, 0, targetW, targetH);
                ctx.drawImage(
                    sheetCanvas,
                    0,
                    frameHeight,
                    frameWidth,
                    frameHeight,
                    0,
                    0,
                    targetW,
                    targetH
                );
                return portraitCanvas.toDataURL('image/png');
            } catch (error) {
                Logger.warn('[FriendsUI] Failed to create friend portrait asset', error);
                return '';
            }
        })();

        this.friendPortraitDataUrl = await this.friendPortraitPromise;
        this.friendPortraitPromise = null;
        return this.friendPortraitDataUrl;
    }

    getFriendPortraitUrl(profile = null) {
        return String(profile?.portraitDataUrl || this.friendPortraitDataUrl || '').trim();
    }

    buildFriendAvatarInnerHtml(name, options = {}) {
        const portraitUrl = this.getFriendPortraitUrl(options.profile || null);
        const fallback = this.escapeHtml(this.getFriendAvatarText(name));
        const imageHtml = portraitUrl
            ? `<span class="friend-avatar-image" style="background-image:url('${this.escapeHtml(portraitUrl)}')"></span>`
            : '';
        return `${imageHtml}<span class="friend-avatar-fallback${portraitUrl ? ' is-hidden' : ''}">${fallback}</span>`;
    }

    getSelectedFriendName() {
        const friend = (this.game.net?.getFriendListSnapshot?.() || []).find((entry) => entry.uid === this.selectedFriendUid);
        return friend?.name || '친구';
    }

    getFriendDisplayName(uid = this.friendChatUid || this.selectedFriendUid) {
        if (!uid) return '친구';
        const friend = (this.game.net?.getFriendListSnapshot?.() || []).find((entry) => entry.uid === uid) || null;
        const profile = this.friendProfileCache.get(uid) || null;
        return friend?.name || profile?.name || uid;
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
        const displayName = this.escapeHtml(candidate.name || candidate.uid);
        const uidText = this.escapeHtml(candidate.uid);
        const statusText = this.getFriendStatusText(candidate.online);
        const stateLabel = isSelf ? '내 캐릭터' : (alreadyFriend ? '이미 친구' : '추가 가능');

        resultEl.classList.remove('is-placeholder');
        resultEl.innerHTML = `
            <div class="friends-search-candidate">
                <div class="friends-search-candidate-avatar" aria-hidden="true">${this.buildFriendAvatarInnerHtml(candidate.name || candidate.uid, { profile: candidate.profile || null })}</div>
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
            addBtn.textContent = '채팅 열기';
            addBtn.disabled = false;
        } else {
            addBtn.textContent = '친구 추가';
            addBtn.disabled = false;
        }
    }

    async selectFriend(uid, options = {}) {
        if (!uid || !this.game.net) return;
        this.selectedFriendUid = uid;
        if (!options.preserveChatTarget && this.friendChatUid && this.friendChatUid !== uid) {
            this.closeFriendChat({ detachThread: true, keepSelection: true, silent: true });
        }

        if (options.showProfile !== false && this.getFriendsPopupMode() !== 'desktop') {
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
            const preview = this.escapeHtml(entry.meta?.lastMessage || '대화를 시작해 보세요.');
            const updatedAt = this.formatFriendTime(entry.meta?.updatedAt || 0);
            const profile = this.friendProfileCache.get(entry.uid) || null;
            item.innerHTML = `
                <div class="friend-thread-avatar" aria-hidden="true">${this.buildFriendAvatarInnerHtml(entry.name || entry.uid, { profile })}</div>
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
                this.openFriendChat(entry.uid);
            });
            listEl.appendChild(item);
        });
    }

    async openFriendChat(uid, options = {}) {
        if (!uid || !this.game.net?.isFriend?.(uid)) return;

        const state = this.ensureFriendChatWindowState();
        if (this.friendChatUid && this.friendChatUid !== uid) {
            this.closeFriendChat({ detachThread: true, keepSelection: true, silent: true });
        }

        this.friendChatReturnView = options.returnView || (this.friendsMobileView || 'list');
        state.requestedUid = uid;
        this.selectedFriendUid = uid;
        this.friendChatUid = uid;
        const chatModal = document.getElementById('friend-chat-modal');
        chatModal?.setAttribute('data-chat-friend-uid', uid);
        chatModal?.classList.remove('hidden');

        await this.selectFriend(uid, { showProfile: false, preserveChatTarget: true });
        state.requestedUid = uid;
        this.selectedFriendUid = uid;
        this.friendChatUid = uid;
        state.compact = !!options.compact;
        state.minimized = false;
        state.unreadWhileMinimized = false;
        state.restoreFriendsPopupOnClose = this.getFriendsPopupMode() === 'mobileLandscape' && this.isPopupOpen('friends-popup');
        this.game.net.openFriendThread(uid);
        this.game.net.setActiveFriendThreadAutoRead?.(true);

        if (state.restoreFriendsPopupOnClose) {
            state.retainOnPopupToggle = true;
            this.togglePopup('friends-popup');
            state.retainOnPopupToggle = false;
        }

        chatModal?.setAttribute('data-chat-friend-uid', uid);
        chatModal?.classList.remove('hidden');
        this.setFriendGiftComposerVisible(!!options.openGift);
        this.refreshFriendGiftOptions();
        this.applyFriendChatWindowState();
        this.renderFriendChatMessages({ forceToLatest: true, uid });
        this.syncFriendChatInputActivation({
            deferred: !options.focusInput && this.shouldDeferFriendChatInputActivation(),
            focus: !!options.focusInput
        });

        if (options.focusInput) {
            window.setTimeout(() => {
                document.getElementById('friend-chat-input')?.focus();
            }, 0);
        }
    }

    closeFriendChat(options = {}) {
        const {
            detachThread = true,
            keepSelection = true,
            silent = false
        } = options;

        document.getElementById('friend-chat-modal')?.classList.add('hidden');
        document.getElementById('friend-chat-modal')?.removeAttribute('data-chat-friend-uid');
        document.getElementById('friend-chat-input')?.blur();
        this.setFriendGiftComposerVisible(false);
        this.toggleFriendChatProfileModal(false);
        this.hideFriendGiftItemTooltip?.();
        this.syncFriendChatInputActivation({ deferred: false, focus: false });

        const state = this.ensureFriendChatWindowState();
        const shouldRestoreFriendsPopup = !!state.restoreFriendsPopupOnClose;
        state.compact = false;
        state.minimized = false;
        state.unreadWhileMinimized = false;
        state.retainOnPopupToggle = false;
        state.restoreFriendsPopupOnClose = false;
        state.requestedUid = null;

        if (detachThread) {
            this.game.net?.closeFriendThread?.(this.friendChatUid);
        } else {
            this.game.net?.setActiveFriendThreadAutoRead?.(true);
        }

        this.friendChatUid = null;
        if (!keepSelection) {
            this.selectedFriendUid = null;
        }
        if (this.getFriendsPopupMode() !== 'desktop') {
            const nextView = this.selectedFriendUid
                ? (this.friendChatReturnView || 'list')
                : 'list';
            this.setFriendsMobileView(nextView, { force: true });
        }
        if (!silent) {
            this.refreshFriendsPopup();
        }
        if (shouldRestoreFriendsPopup && !this.isPopupOpen('friends-popup')) {
            state.retainOnPopupToggle = true;
            this.togglePopup('friends-popup');
            state.retainOnPopupToggle = false;
            this.setFriendsMobileView('list', { force: true });
        }
    }

    setFriendGiftComposerVisible(visible) {
        const composer = document.getElementById('friend-gift-composer');
        const toggleBtn = document.getElementById('friend-chat-gift-toggle-btn');
        const nextVisible = !!visible;

        composer?.classList.toggle('hidden', !nextVisible);
        if (toggleBtn) {
            toggleBtn.classList.toggle('is-active', nextVisible);
            toggleBtn.title = nextVisible ? '선물 접기' : '선물 열기';
            toggleBtn.setAttribute('aria-label', toggleBtn.title);
        }
        if (nextVisible) {
            const state = this.ensureFriendChatWindowState();
            const preset = this.getFriendChatCompactViewportPreset({ isGiftOpen: true });
            if (this.isFriendChatCompactMode()) {
                state.width = Math.max(Number(state.width) || 0, preset.width);
                state.height = Math.max(Number(state.height) || 0, preset.height);
            }
            this.refreshFriendGiftOptions();
            if (this.friendGiftKind === 'item' && !this.isFriendChatMinimized()) {
                this.toggleFriendGiftItemPicker(true);
            }
        } else {
            this.toggleFriendGiftItemPicker(false);
        }
        this.syncFriendGiftComposerLayoutState();
        this.applyFriendChatWindowState();
    }

    syncFriendGiftComposerLayoutState() {
        const card = document.getElementById('friend-chat-card');
        const body = document.getElementById('friend-chat-body');
        const composer = document.getElementById('friend-gift-composer');
        const isVisible = !!composer && !composer.classList.contains('hidden');

        card?.classList.toggle('is-gift-open', isVisible);
        body?.classList.toggle('is-gift-open', isVisible);
        composer?.classList.toggle('is-item-mode', isVisible && this.friendGiftKind === 'item');
        composer?.classList.toggle('is-manastone-mode', isVisible && this.friendGiftKind !== 'item');
    }

    setFriendGiftKind(kind = 'manastone') {
        this.friendGiftKind = kind === 'item' ? 'item' : 'manastone';
        document.getElementById('friend-gift-kind-manastone')?.classList.toggle('is-active', this.friendGiftKind === 'manastone');
        document.getElementById('friend-gift-kind-item')?.classList.toggle('is-active', this.friendGiftKind === 'item');
        document.getElementById('friend-gift-manastone-panel')?.classList.toggle('hidden', this.friendGiftKind !== 'manastone');
        document.getElementById('friend-gift-item-panel')?.classList.toggle('hidden', this.friendGiftKind !== 'item');
        if (this.friendGiftKind === 'item') {
            this.refreshFriendGiftOptions();
            if (!this.isFriendChatMinimized()) {
                this.toggleFriendGiftItemPicker(true);
            }
        } else {
            this.toggleFriendGiftItemPicker(false);
            this.refreshFriendGiftOptions();
        }
        this.syncFriendGiftComposerLayoutState();
    }

    refreshFriendGiftOptions() {
        const balanceEl = document.getElementById('friend-gift-balance');
        const itemAmountInput = document.getElementById('friend-gift-item-amount');
        const manastoneAmountInput = document.getElementById('friend-gift-manastone-amount');
        const sendBtn = document.getElementById('friend-gift-send-btn');
        const itemSummaryEl = document.getElementById('friend-gift-item-summary');
        const actionsEl = document.querySelector('#friend-gift-composer .friend-gift-actions');
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

        const giftableItems = this.getGiftableFriendInventoryItems(player);
        const selection = this.resolveFriendGiftSelection(giftableItems);
        const selectedItem = selection?.item || null;
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
        if (itemSummaryEl) {
            itemSummaryEl.textContent = selectedItem
                ? this.buildFriendGiftItemLabel(selectedItem, Math.max(1, Number(itemAmountInput?.value || 1)))
                : '선택한 아이템이 없습니다.';
        }

        if (sendBtn) {
            sendBtn.disabled = this.friendGiftKind === 'item'
                ? !selectedItem
                : manastone <= 0;
        }
        actionsEl?.classList.toggle('hidden', this.friendGiftKind === 'item' && !selectedItem);

        this.renderFriendGiftPicker(giftableItems);
        this.renderFriendGiftSelectionPreview(selection?.item || null, Math.max(1, Number(itemAmountInput?.value || 1)));
        this.positionFriendGiftItemPicker();
    }

    getGiftableFriendInventoryItems(player = this.game.localPlayer) {
        return (player?.inventory || [])
            .map((item, index) => ({ item, index }))
            .filter(({ item, index }) => index > 0 && item);
    }

    resolveFriendGiftSelection(entries = this.getGiftableFriendInventoryItems()) {
        const selection = this.friendGiftSelection || null;
        if (!selection) return null;

        const identity = selection.identity || null;
        const resolvedIndex = identity
            ? this.findInventoryIndexByIdentity(this.game.localPlayer, identity)
            : Number(selection.index ?? -1);
        const nextSelection = entries.find(({ index }) => index === resolvedIndex) || null;
        if (!nextSelection) {
            this.friendGiftSelection = null;
            return null;
        }

        this.friendGiftSelection = {
            index: nextSelection.index,
            identity: this.getInventoryItemIdentity(nextSelection.item)
        };
        return nextSelection;
    }

    toggleFriendGiftItemPicker(visible) {
        const picker = document.getElementById('friend-gift-item-picker');
        if (!picker) return;
        const card = document.getElementById('friend-chat-card');
        if (card && picker.parentElement !== card) {
            card.appendChild(picker);
        }
        picker.classList.add('is-floating');
        picker.classList.toggle('hidden', !visible);
        if (!visible) {
            this.hideFriendGiftItemTooltip();
            return;
        }
        this.positionFriendGiftItemPicker();
    }

    renderFriendGiftPicker(entries = this.getGiftableFriendInventoryItems()) {
        const picker = document.getElementById('friend-gift-item-picker');
        if (!picker) return;

        picker.innerHTML = '';
        if (!entries.length) {
            picker.innerHTML = '<div class="friend-gift-picker-empty">보낼 수 있는 아이템이 없습니다.</div>';
            return;
        }

        entries.forEach(({ item, index }) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'friend-gift-picker-item';
            button.dataset.friendGiftPreviewIndex = String(index);
            button.innerHTML = `
                <span class="friend-gift-picker-icon">${this.createInventoryIconElement(item, 'friend-gift-icon').outerHTML}</span>
                <span class="friend-gift-picker-meta">
                    <strong>${this.escapeHtml(this.buildFriendGiftItemLabel(item))}</strong>
                    <span>${this.escapeHtml(item.stackable === false || item.slot ? '장비' : `보유 x${Math.max(1, Number(item.amount || 1)).toLocaleString('ko-KR')}`)}</span>
                </span>
            `;
            button.addEventListener('click', () => {
                this.friendGiftSelection = {
                    index,
                    identity: this.getInventoryItemIdentity(item)
                };
                this.toggleFriendGiftItemPicker(false);
                this.refreshFriendGiftOptions();
            });
            button.addEventListener('mouseenter', () => this.toggleFriendGiftItemDetailFromElement(button, { forceShow: true }));
            button.addEventListener('mouseleave', () => this.hideFriendGiftItemTooltip());
            picker.appendChild(button);
        });
    }

    positionFriendGiftItemPicker() {
        const picker = document.getElementById('friend-gift-item-picker');
        const card = document.getElementById('friend-chat-card');
        const anchor = document.getElementById('friend-gift-item-picker-btn');
        if (!picker || !card || !anchor || picker.classList.contains('hidden')) return;
        if (this.isFriendChatCompactMode() && this.isFriendChatMinimized()) return;

        const cardRect = card.getBoundingClientRect();
        const anchorRect = anchor.getBoundingClientRect();
        if (!cardRect.width || !cardRect.height || !anchorRect.width || !anchorRect.height) return;

        const scale = this.getFriendChatVisualScale();
        const localWidth = cardRect.width / scale;
        const localHeight = cardRect.height / scale;
        const margin = this.isFriendChatCompactMode() ? 10 : 12;
        const gap = 8;
        const preferredWidth = this.isFriendChatCompactMode() ? 248 : 320;
        const width = Math.min(preferredWidth, Math.max(180, Math.round(localWidth - margin * 2)));
        const anchorLeft = (anchorRect.left - cardRect.left) / scale;
        const anchorTop = (anchorRect.top - cardRect.top) / scale;
        const anchorBottom = (anchorRect.bottom - cardRect.top) / scale;
        let left = Math.round(anchorLeft + anchorRect.width / scale - width);
        left = Math.min(
            Math.max(margin, left),
            Math.max(margin, Math.round(localWidth - width - margin))
        );

        const maxHeight = Math.min(this.isFriendChatCompactMode() ? 188 : 228, Math.max(124, Math.floor(localHeight - margin * 2)));
        let top = Math.round(anchorBottom + gap);
        const roomBelow = localHeight - top - margin;
        if (roomBelow < 124) {
            top = Math.max(margin, Math.round(anchorTop - maxHeight - gap));
        }

        picker.style.setProperty('--friend-gift-picker-left', `${left}px`);
        picker.style.setProperty('--friend-gift-picker-top', `${top}px`);
        picker.style.setProperty('--friend-gift-picker-width', `${width}px`);
        picker.style.setProperty('--friend-gift-picker-max-height', `${maxHeight}px`);
    }

    renderFriendGiftSelectionPreview(item = null, amount = 1) {
        const listEl = document.getElementById('friend-gift-selected-list');
        if (!listEl) return;

        listEl.innerHTML = '';
        if (!item) {
            listEl.innerHTML = '<div class="friend-gift-picker-empty">아이템을 선택하면 여기에 등록됩니다.</div>';
            return;
        }

        const preview = document.createElement('button');
        preview.type = 'button';
        preview.className = 'friend-gift-preview-card';
        preview.dataset.friendGiftPreviewIndex = String(this.friendGiftSelection?.index ?? '');
        preview.innerHTML = `
            <span class="friend-gift-preview-icon">${this.createInventoryIconElement(item, 'friend-gift-icon').outerHTML}</span>
            <span class="friend-gift-preview-meta">
                <strong>${this.escapeHtml(this.buildFriendGiftItemLabel(item, amount))}</strong>
                <span>${this.escapeHtml(this.buildFriendGiftItemQuantityLabel(item, amount))}</span>
            </span>
        `;
        preview.addEventListener('click', (event) => {
            event.preventDefault();
            this.toggleFriendGiftItemDetailFromElement(preview);
        });
        preview.addEventListener('mouseenter', () => this.toggleFriendGiftItemDetailFromElement(preview, { forceShow: true }));
        preview.addEventListener('mouseleave', () => this.hideFriendGiftItemTooltip());
        listEl.appendChild(preview);
    }

    buildFriendGiftItemLabel(item = {}, amount = Number(item?.amount || 1)) {
        const enhancementLevel = Math.max(0, Number(item?.enhancementLevel || 0));
        const baseName = item?.name || item?.type || item?.id || '아이템';
        const title = enhancementLevel > 0 ? `+${enhancementLevel} ${baseName}` : baseName;
        if (item?.stackable === false || item?.slot) return title;
        return `${title} x${Math.max(1, Number(amount || 1)).toLocaleString('ko-KR')}`;
    }

    buildFriendGiftItemQuantityLabel(item = {}, amount = Number(item?.amount || 1)) {
        if (item?.stackable === false || item?.slot) {
            return item?.slot === 'weapon' ? '장비' : '개별 아이템';
        }
        return `수량 ${Math.max(1, Number(amount || 1)).toLocaleString('ko-KR')}`;
    }

    renderFriendChatMessages(options = {}) {
        const container = document.getElementById('friend-chat-messages');
        const chatModal = document.getElementById('friend-chat-modal');
        if (!container) return;
        const forceToLatest = !!options.forceToLatest;
        const stickToBottom = Math.abs((container.scrollHeight - container.scrollTop) - container.clientHeight) < 28;
        const state = this.ensureFriendChatWindowState();
        const requestedUid = typeof options.uid === 'string' && options.uid
            ? options.uid
            : (state.requestedUid
                || chatModal?.getAttribute('data-chat-friend-uid')
                || this.game.net?.getActiveFriendThreadUid?.()
                || '');
        const targetUid = requestedUid || this.friendChatUid || this.selectedFriendUid || null;
        if (!targetUid) {
            container.innerHTML = '<div class="friend-chat-empty">대화할 친구를 먼저 선택해 주세요.</div>';
            return;
        }
        if (requestedUid && state.requestedUid !== requestedUid) {
            state.requestedUid = requestedUid;
        }
        if (chatModal?.getAttribute('data-chat-friend-uid') !== targetUid) {
            chatModal?.setAttribute('data-chat-friend-uid', targetUid);
        }
        if (requestedUid && this.friendChatUid !== requestedUid) {
            this.friendChatUid = requestedUid;
        } else if (!this.friendChatUid) {
            this.friendChatUid = targetUid;
        }
        if (requestedUid && this.selectedFriendUid !== requestedUid) {
            this.selectedFriendUid = requestedUid;
        } else if (!this.selectedFriendUid) {
            this.selectedFriendUid = targetUid;
        }

        const friend = (this.game.net?.getFriendListSnapshot?.() || []).find((entry) => entry.uid === targetUid) || null;
        const profile = this.friendProfileCache.get(targetUid) || null;
        const displayName = this.getFriendDisplayName(targetUid);
        const titleEl = document.getElementById('friend-chat-title');
        const statusEl = document.getElementById('friend-chat-status');
        const statusDot = document.getElementById('friend-chat-status-dot');
        const avatarBtn = document.getElementById('friend-chat-avatar-btn');
        if (titleEl) titleEl.textContent = displayName;
        if (statusEl) {
            statusEl.textContent = this.getFriendStatusText(friend?.online);
            statusEl.classList.toggle('is-online', !!friend?.online);
            statusEl.setAttribute('aria-label', this.getFriendStatusText(friend?.online));
        }
        if (statusDot) {
            statusDot.classList.toggle('is-online', !!friend?.online);
            statusDot.classList.toggle('is-offline', !friend?.online);
            statusDot.title = this.getFriendStatusText(friend?.online);
        }
        if (avatarBtn) {
            avatarBtn.innerHTML = this.buildFriendAvatarInnerHtml(displayName, { profile });
        }

        const messages = this.game.net?.getFriendThreadMessagesSnapshot?.(targetUid) || [];
        if (!messages.length) {
            container.innerHTML = '<div class="friend-chat-empty">아직 주고받은 메시지가 없습니다. 먼저 말을 걸어 보세요.</div>';
            this.scrollFriendChatToLatest();
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
                ${isMine ? '' : `<button type="button" class="friend-message-avatar" data-friend-avatar-open-profile="${this.escapeHtml(targetUid)}" aria-label="${this.escapeHtml(displayName)} 프로필 보기">${this.buildFriendAvatarInnerHtml(displayName, { profile })}</button>`}
                <div class="friend-message-bubble${message.type === 'gift' ? ' is-gift' : ''}">
                    ${bodyHtml}
                    <div class="friend-message-meta">${this.escapeHtml(this.formatFriendTime(message.ts))}</div>
                </div>
            `;
            container.appendChild(row);
        });

        container.querySelectorAll('[data-friend-gift-item-message-id]').forEach((button) => {
            button.addEventListener('mouseenter', () => this.toggleFriendGiftItemDetailFromElement(button, { forceShow: true }));
            button.addEventListener('mouseleave', () => this.hideFriendGiftItemTooltip());
        });

        if (forceToLatest || stickToBottom) {
            this.scrollFriendChatToLatest(forceToLatest ? 4 : 2);
        }
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
        const item = gift.item || null;
        const title = gift.kind === 'manastone'
            ? `마석 ${amount.toLocaleString('ko-KR')}`
            : this.buildFriendGiftItemLabel(item || { name: gift.itemName || gift.itemId || '아이템' }, amount);
        const description = isMine ? '선물을 보냈습니다.' : '선물이 도착했습니다.';

        let stateHtml = '';
        if (!isMine && gift.status === 'pending') {
            stateHtml = `
                <button type="button" class="friend-gift-claim-btn" data-claim-gift-id="${this.escapeHtml(message.id || '')}">수령</button>
                <button type="button" class="friends-secondary-action" data-reject-gift-id="${this.escapeHtml(message.id || '')}">거절</button>
            `;
        } else if (isMine && gift.status === 'pending') {
            stateHtml = `
                <span class="friend-gift-state">수령 대기</span>
                <button type="button" class="friends-secondary-action" data-cancel-gift-id="${this.escapeHtml(message.id || '')}">회수</button>
            `;
        } else {
            const stateMap = {
                claimed: '수령 완료',
                rejected: '거절됨',
                canceled: '회수 완료',
                pending: '수령 대기'
            };
            const stateText = stateMap[gift.status] || '처리 완료';
            stateHtml = `<span class="friend-gift-state${gift.status === 'claimed' ? ' is-claimed' : ''}${gift.status === 'rejected' || gift.status === 'canceled' ? ' is-muted' : ''}">${stateText}</span>`;
        }

        const itemCardHtml = gift.kind === 'item' && item
            ? `
                <button
                    type="button"
                    class="friend-gift-item-card"
                    data-friend-gift-item-message-id="${this.escapeHtml(message.id || '')}"
                    aria-label="${this.escapeHtml(title)} 상세 보기"
                >
                    <span class="friend-gift-preview-icon">${this.createInventoryIconElement(item, 'friend-gift-icon').outerHTML}</span>
                    <span class="friend-gift-preview-meta">
                        <strong>${this.escapeHtml(title)}</strong>
                        <span>${this.escapeHtml(this.buildFriendGiftItemQuantityLabel(item, amount))}</span>
                    </span>
                </button>
            `
            : `<strong>${this.escapeHtml(title)}</strong>`;

        return `
            <div class="friend-gift-card">
                ${itemCardHtml}
                <p>${this.escapeHtml(description)}</p>
                <div class="friend-gift-state-row">${stateHtml}</div>
            </div>
        `;
    }

    findFriendThreadMessageById(messageId, targetUid = this.friendChatUid || this.selectedFriendUid) {
        if (!messageId || !targetUid) return null;
        return (this.game.net?.getFriendThreadMessagesSnapshot?.(targetUid) || []).find((message) => message.id === messageId) || null;
    }

    buildFriendGiftItemTooltipData(item = null) {
        if (!item) return null;
        const detail = this.buildInventoryDetail(this.game.localPlayer || {}, item);
        return {
            item,
            title: detail.title || item.name || item.type || '아이템',
            subtitle: detail.subtitle || '',
            description: detail.description || '',
            lines: this.mergeInventoryEnhancementBonusLines(detail.lines).filter(Boolean)
        };
    }

    ensureFriendGiftItemTooltip() {
        let tooltip = document.getElementById('friend-gift-item-tooltip');
        if (tooltip) return tooltip;

        tooltip = document.createElement('div');
        tooltip.id = 'friend-gift-item-tooltip';
        tooltip.className = 'friend-gift-item-tooltip hidden';
        document.body.appendChild(tooltip);
        return tooltip;
    }

    showFriendGiftItemTooltip(tooltipData, anchorEl) {
        if (!tooltipData || !anchorEl) return;

        const tooltip = this.ensureFriendGiftItemTooltip();
        tooltip.innerHTML = '';

        const card = document.createElement('div');
        card.className = 'friend-gift-item-tooltip-card';

        const head = document.createElement('div');
        head.className = 'inventory-detail-head';

        const iconWrap = document.createElement('div');
        iconWrap.className = 'inventory-detail-icon';
        iconWrap.appendChild(this.createInventoryIconElement(tooltipData.item, 'inventory-detail-icon-asset'));
        head.appendChild(iconWrap);

        const titleBlock = document.createElement('div');
        titleBlock.className = 'inventory-detail-title-block';

        const titleEl = document.createElement('h3');
        titleEl.textContent = tooltipData.title;
        titleBlock.appendChild(titleEl);

        if (tooltipData.subtitle) {
            const subtitleEl = document.createElement('p');
            subtitleEl.textContent = tooltipData.subtitle;
            titleBlock.appendChild(subtitleEl);
        }

        head.appendChild(titleBlock);
        card.appendChild(head);

        if (tooltipData.description) {
            const descEl = document.createElement('p');
            descEl.className = 'inventory-detail-desc';
            descEl.textContent = tooltipData.description;
            card.appendChild(descEl);
        }

        if (tooltipData.lines?.length) {
            const statsEl = document.createElement('ul');
            statsEl.className = 'inventory-detail-stats';
            tooltipData.lines.forEach((line) => {
                statsEl.appendChild(this.createInventoryDetailStatLineElement(line));
            });
            card.appendChild(statsEl);
        }

        tooltip.appendChild(card);
        tooltip.classList.remove('hidden');
        this.friendGiftTooltipAnchor = anchorEl;
        this.positionFriendGiftItemTooltip(anchorEl);
    }

    positionFriendGiftItemTooltip(anchorEl = this.friendGiftTooltipAnchor) {
        const tooltip = document.getElementById('friend-gift-item-tooltip');
        const card = tooltip?.querySelector('.friend-gift-item-tooltip-card');
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

    hideFriendGiftItemTooltip() {
        const tooltip = document.getElementById('friend-gift-item-tooltip');
        if (!tooltip) return;

        tooltip.classList.add('hidden');
        tooltip.innerHTML = '';
        tooltip.style.removeProperty('transform');
        this.friendGiftTooltipAnchor = null;
    }

    toggleFriendGiftItemDetailFromElement(element, options = {}) {
        if (!element) return;

        const messageId = element.getAttribute('data-friend-gift-item-message-id');
        const previewIndex = Number(element.getAttribute('data-friend-gift-preview-index') || -1);
        let item = null;

        if (messageId) {
            const message = this.findFriendThreadMessageById(messageId);
            item = message?.gift?.item || null;
        } else if (previewIndex > 0) {
            item = (this.game.localPlayer?.inventory || [])[previewIndex] || null;
        }

        const tooltipData = this.buildFriendGiftItemTooltipData(item);
        if (!tooltipData) return;

        const tooltip = document.getElementById('friend-gift-item-tooltip');
        const isOpen = tooltip
            && !tooltip.classList.contains('hidden')
            && this.friendGiftTooltipAnchor === element;

        if (isOpen && !options.forceShow) {
            this.hideFriendGiftItemTooltip();
            return;
        }

        this.showFriendGiftItemTooltip(tooltipData, element);
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
        const attackBase = (base.atk ?? 10) + (intelligence * (growth.atk ?? 1)) + Math.floor(wisdom / 2);
        const defenseBase = (base.def ?? 1) + (vitality * (growth.def ?? 1));
        const hpRegenBase = (base.hpRegen ?? 1) + vitality;
        const mpRegenBase = (base.mpRegen ?? 2) + wisdom;
        const attackSpeedBase = Math.min(2.0, 1.0 + (agility * 0.1) + (intelligence * 0.05));
        const critRateBase = 0.1 + (agility * 0.01) + (intelligence * 0.01);
        const moveSpeedBase = 1.0 + (agility * 0.05);
        const attack = Number(profile.attackPower ?? attackBase);
        const defense = Number(profile.defense ?? defenseBase);
        const hpRegen = Number(profile.hpRegen ?? hpRegenBase);
        const mpRegen = Number(profile.mpRegen ?? mpRegenBase);
        const attackSpeed = Number(profile.attackSpeed ?? attackSpeedBase);
        const critRate = Number(profile.critRate ?? critRateBase);
        const moveSpeed = Number(profile.moveSpeedBonus ?? moveSpeedBase);

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
            hpRegen,
            mpRegen,
            attackSpeed,
            critRate,
            moveSpeed
        };
    }

    buildFriendProfileSummaryMarkupLegacy(selected, meta = {}, derived = null) {
        const lastMessage = String(meta?.lastMessage || '아직 주고받은 메시지가 없습니다.');
        const lastUpdated = meta?.updatedAt ? this.formatFriendTime(meta.updatedAt) : '기록 없음';
        const levelText = derived ? `Lv.${derived.level}` : '프로필 동기화 중';
        const statusText = selected.online ? '함께하기 가능' : '오프라인';

        return `
            <div class="friends-profile-summary-card">
                <div class="friends-profile-summary-grid">
                    <span class="friends-profile-summary-chip">${this.escapeHtml(levelText)}</span>
                    <span class="friends-profile-summary-chip">${this.escapeHtml(`최근 대화 ${lastUpdated}`)}</span>
                    <span class="friends-profile-summary-chip${selected.online ? ' is-online' : ''}">${this.escapeHtml(statusText)}</span>
                </div>
                <div class="friends-profile-summary-row">
                    <strong>UID</strong>
                    <span>${this.escapeHtml(selected.uid || '-')}</span>
                </div>
                <div class="friends-profile-summary-row is-message">
                    <strong>최근 메시지</strong>
                    <span>${this.escapeHtml(lastMessage)}</span>
                </div>
            </div>
        `;
    }

    buildFriendProfileStatsMarkupLegacy(derived) {
        if (!derived) return '';

        return `
            <div class="friends-profile-status-grid">
                <div class="friends-profile-stat-main stat-main">
                    <div class="friends-profile-point-info">기본 스탯</div>
                    <div class="stat-row-ui">
                        <label>체력 (VIT)</label>
                        <div class="stat-value-container"><span class="stat-value">${derived.vitality}</span></div>
                    </div>
                    <div class="stat-row-ui">
                        <label>지능 (INT)</label>
                        <div class="stat-value-container"><span class="stat-value">${derived.intelligence}</span></div>
                    </div>
                    <div class="stat-row-ui">
                        <label>지혜 (WIS)</label>
                        <div class="stat-value-container"><span class="stat-value">${derived.wisdom}</span></div>
                    </div>
                    <div class="stat-row-ui">
                        <label>순발력 (AGI)</label>
                        <div class="stat-value-container"><span class="stat-value">${derived.agility}</span></div>
                    </div>
                </div>
                <div class="friends-profile-stat-derived stat-derived">
                    <div class="friends-profile-point-info">현재 상태</div>
                    <div class="derived-row"><span>현재 HP</span><span>${Math.floor(derived.hp)} / ${Math.floor(derived.maxHp)}</span></div>
                    <div class="derived-row"><span>현재 MP</span><span>${Math.floor(derived.mp)} / ${Math.floor(derived.maxMp)}</span></div>
                    <div class="derived-row"><span>공격력</span><span>${Math.floor(derived.attack)}</span></div>
                    <div class="derived-row"><span>방어력</span><span>${Math.floor(derived.defense)}</span></div>
                    <div class="derived-row"><span>체력 회복력</span><span>${Math.floor(derived.hpRegen)}</span></div>
                    <div class="derived-row"><span>마나 회복력</span><span>${Math.floor(derived.mpRegen)}</span></div>
                    <div class="derived-row"><span>공격속도</span><span>${derived.attackSpeed.toFixed(2)}</span></div>
                    <div class="derived-row"><span>치명확률</span><span>${Math.round(derived.critRate * 100)}%</span></div>
                    <div class="derived-row"><span>이동속도</span><span>${Math.round(derived.moveSpeed * 100)}%</span></div>
                </div>
            </div>
        `;
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

    async ensureFriendProfileLoaded(uid) {
        if (!uid || !this.game.net) return null;
        if (!this.friendProfileCache.has(uid)) {
            try {
                const profile = await this.game.net.getPlayerProfile(uid);
                if (profile) {
                    this.friendProfileCache.set(uid, profile);
                }
            } catch (error) {
                Logger.warn('[UI] Failed to load friend profile', error);
            }
        }
        return this.friendProfileCache.get(uid) || null;
    }

    populateFriendProfileElements(selected, elements = {}) {
        if (!selected) return;
        const profile = this.friendProfileCache.get(selected.uid) || null;
        const displayName = profile?.name || selected.name || '친구';
        const meta = this.getFriendThreadMeta(selected.uid);
        const {
            avatarEl = null,
            nameEl = null,
            statusEl = null,
            metaEl = null,
            summaryEl = null,
            statsEl = null,
            weaponEl = null,
            togetherBtn = null
        } = elements;

        if (avatarEl) {
            avatarEl.innerHTML = this.buildFriendAvatarInnerHtml(displayName, { profile });
        }
        if (nameEl) nameEl.textContent = displayName;
        if (statusEl) {
            statusEl.textContent = this.getFriendStatusText(selected.online);
            statusEl.classList.toggle('is-online', !!selected.online);
        }
        if (metaEl) {
            metaEl.textContent = '';
            metaEl.classList.add('hidden');
        }
        if (togetherBtn) {
            togetherBtn.disabled = !selected.online;
        }

        if (summaryEl) {
            summaryEl.innerHTML = this.buildFriendProfileSummaryMarkup(selected, meta, profile ? this.buildFriendDerivedStats(profile) : null);
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
            statsEl.innerHTML = this.buildFriendProfileStatsMarkup(derived);
        }

        this.renderFriendProfileWeapon(weaponEl, profile);
    }

    toggleFriendChatProfileModal(visible, options = {}) {
        const modal = document.getElementById('friend-chat-profile-modal');
        if (!modal) return;

        const nextVisible = !!visible;
        if (nextVisible) {
            this.friendChatProfileUid = options.uid || this.friendChatProfileUid || this.friendChatUid || this.selectedFriendUid || null;
            modal.classList.remove('hidden');
            this.renderFriendChatProfileModal(this.friendChatProfileUid);
            return;
        }

        modal.classList.add('hidden');
        this.friendChatProfileUid = null;
    }

    renderFriendChatProfileModal(uid = this.friendChatProfileUid || this.friendChatUid || this.selectedFriendUid) {
        if (!uid) {
            this.toggleFriendChatProfileModal(false);
            return;
        }

        const selected = (this.game.net?.getFriendListSnapshot?.() || []).find((entry) => entry.uid === uid) || null;
        if (!selected) {
            this.toggleFriendChatProfileModal(false);
            return;
        }

        this.populateFriendProfileElements(selected, {
            avatarEl: document.getElementById('friend-chat-profile-avatar'),
            nameEl: document.getElementById('friend-chat-profile-name'),
            statusEl: document.getElementById('friend-chat-profile-status'),
            metaEl: document.getElementById('friend-chat-profile-meta'),
            summaryEl: document.getElementById('friend-chat-profile-summary'),
            statsEl: document.getElementById('friend-chat-profile-stats'),
            weaponEl: document.getElementById('friend-chat-profile-weapon'),
            togetherBtn: document.getElementById('friend-chat-profile-together-btn')
        });
    }

    syncFriendChatOpacityUi(value = this.getSetting?.('friendCompactOpacity')) {
        const slider = document.getElementById('friend-chat-opacity-slider');
        const valueEl = document.getElementById('friend-chat-opacity-value');
        const normalized = Math.min(100, Math.max(45, Math.round(Number(value) || 82)));
        if (slider) {
            slider.value = String(normalized);
        }
        if (valueEl) {
            valueEl.textContent = `${normalized}%`;
        }
    }

    setFriendChatOpacity(value) {
        const normalized = Math.min(100, Math.max(45, Math.round(Number(value) || this.getSetting?.('friendCompactOpacity') || 82)));
        this.syncFriendChatOpacityUi(normalized);
        this.updateSetting?.('friendCompactOpacity', normalized, { refreshGame: false });
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

        emptyEl.classList.add('hidden');
        panelEl.classList.remove('hidden');
        this.populateFriendProfileElements(selected, {
            avatarEl: document.getElementById('friend-profile-avatar'),
            nameEl: document.getElementById('friend-profile-name'),
            statusEl: document.getElementById('friend-profile-status'),
            metaEl: document.getElementById('friend-profile-meta'),
            summaryEl: document.getElementById('friend-profile-summary'),
            statsEl: document.getElementById('friend-profile-stats'),
            weaponEl: document.getElementById('friend-profile-weapon'),
            togetherBtn: document.getElementById('friend-profile-together-btn')
        });
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

    buildFriendProfileSummaryMarkup(selected, meta = {}, derived = null) {
        const levelText = derived ? `Lv.${derived.level}` : '프로필 불러오는 중';
        const statusText = selected.online ? '온라인' : '오프라인';
        const hpText = derived
            ? `HP ${Math.floor(derived.hp)} / ${Math.floor(derived.maxHp)}`
            : 'HP 확인 중';
        const mpText = derived
            ? `MP ${Math.floor(derived.mp)} / ${Math.floor(derived.maxMp)}`
            : 'MP 확인 중';

        return `
            <div class="friends-profile-summary-card">
                <div class="friends-profile-summary-grid is-simple">
                    <span class="friends-profile-summary-chip">${this.escapeHtml(levelText)}</span>
                    <span class="friends-profile-summary-chip${selected.online ? ' is-online' : ''}">${this.escapeHtml(statusText)}</span>
                    <span class="friends-profile-summary-chip">${this.escapeHtml(hpText)}</span>
                    <span class="friends-profile-summary-chip">${this.escapeHtml(mpText)}</span>
                </div>
            </div>
        `;
    }

    buildFriendProfileStatsMarkup(derived) {
        if (!derived) return '';

        return `
            <div class="friends-profile-stat-list">
                <div class="friends-profile-stat-card">
                    <strong>레벨</strong>
                    <span>Lv.${derived.level}</span>
                </div>
                <div class="friends-profile-stat-card">
                    <strong>HP</strong>
                    <span>${Math.floor(derived.hp)} / ${Math.floor(derived.maxHp)}</span>
                </div>
                <div class="friends-profile-stat-card">
                    <strong>MP</strong>
                    <span>${Math.floor(derived.mp)} / ${Math.floor(derived.maxMp)}</span>
                </div>
            </div>
        `;
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
        if (this.friendChatProfileUid && !friends.some((entry) => entry.uid === this.friendChatProfileUid)) {
            this.toggleFriendChatProfileModal(false);
        } else if (this.friendChatProfileUid && !document.getElementById('friend-chat-profile-modal')?.classList.contains('hidden')) {
            this.renderFriendChatProfileModal(this.friendChatProfileUid);
        }
        this.syncFriendsPopupLayout();

        if (this.friendChatUid && !document.getElementById('friend-chat-modal')?.classList.contains('hidden')) {
            this.renderFriendChatMessages();
        }

        const hasUnread = entries.some((entry) => entry.unread);
        this.setFriendsAlertActive(!this.isPopupOpen('friends-popup') && hasUnread);
    }
}
