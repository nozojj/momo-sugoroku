# 効果音(SE)の出所・ライセンス一覧

このファイルは`public/sounds/`配下の各音源ファイルについて、入手元・ライセンス・(生成音源の場合は)生成方法を記録する。新しい音源を追加するときは必ずこのファイルにも1行(または1節)追記すること。

出所・ライセンスを確認できない素材はこのプロジェクトでは使用しない方針。

## 自作(手続き的生成)

以下は`scripts/generate-se.mjs`で波形合成のみによって生成した音源で、外部の音源・サンプル・ライブラリには一切依存していない。著作権はこのリポジトリの管理者に帰属し、他者の権利との抵触は発生しない。

再生成する場合は `node scripts/generate-se.mjs` を実行する(決定論的な生成のため、パラメータを変えない限り常に同一のバイト列が出力される)。個々の周波数・尺・音量・減衰などのパラメータは同スクリプト内の`SOUND_DEFS`にコメント付きで記載している。

| ファイル | 導入 | 生成方式の概要 |
|---|---|---|
| `dice_roll.wav` | P10-4-1 (2026-08-22) | 矩形波の短いブリップ5音(300/420/340/460/600Hz)を無音を挟んで連結、サイコロが転がる質感 |
| `step_move.wav` | P10-4-1 (2026-08-22) | 三角波の下降スイープ(520→360Hz)、70ms。高頻度SEのため最も軽い音色・音量に調整 |
| `roulette_tick.wav` | P10-4-1 (2026-08-22) | 矩形波の単発ブリップ(1800Hz)、26ms。最短約30ms間隔で再トリガーされるため、自己打ち切りが気にならないよう意図的に極短にしている |
| `money_gain.wav` | P10-4-1 (2026-08-22) | 矩形波の上昇アルペジオ(C5→E5→G5→C6)、335ms |
| `money_loss.wav` | P10-4-1 (2026-08-22) | ごく短いノイズonset+三角波の下降スイープ(600→280Hz)、328ms |
| `card_get.wav` | P10-4-2 (2026-08-22) | 三角波2音のベル風チャイム(A5→D6)、295ms。money_gain(矩形波4音アルペジオ)・card_use・property_buyと聞き分けやすいよう波形自体を変えている |
| `card_use.wav` | P10-4-2 (2026-08-22) | ノイズクリック+矩形波の上昇スイープ(500→900Hz)、226ms。「発動」の勢いを出すため上昇方向にした(step_moveは下降スイープで区別) |
| `property_buy.wav` | P10-4-2 (2026-08-22) | ノイズクリック(レジ/コイン投入)+矩形波2音(C6→G6、後の音ほど高く)、212ms |
| `monopoly_group.wav` | P10-4-3 (2026-08-22) | 矩形波の単声ファンファーレ「ソ・ソ・ド」(G5-G5-C6)、450ms。出所・ライセンス確認不可だった旧`monopoly_group.mp3`(下記参照)を正式に置き換えた |
| `monopoly_region.wav` | P10-4-3 (2026-08-22) | monopoly_groupと同じG5-G5-C6のモチーフから始まり、E6-G6-C7へ駆け上がった後、C7(矩形波)+G6(三角波)の2声和音で締める、864ms。groupとの格差を尺(約1.9倍)・音域(C6止まり→C7)・声部の厚み(単声→2声)で表現。フィナーレの2声合成部分はピーク振幅0.777(クリッピングなし、ヘッドルームあり)を実測で確認済み |
| `destination_arrive.wav` | P10-4-3 (2026-08-22) | 三角波の上行3音(E5→G5→C6)、400ms。「到着・祝福」の明るく柔らかいジングル |
| `destination_reveal.wav` | P10-4-3 (2026-08-22) | 矩形波の2音(B5→E6、完全4度跳躍)、130ms。「次の目的地決定」の短く明瞭な確定音。destination_arriveとは波形・音数・尺のすべてを変えて区別している |
| `game_over_fanfare.wav` | P10-4-4 (2026-08-22) | 矩形波の呼びかけ(G4→C5→E5→G5→C6)→1オクターブ上のエコー(C6→E6→G6→C7)→C7(矩形波)+G6+E6(三角波)の3声和音フィナーレ、1489ms。ゲーム全体で最も低い音(G4)から始まり、最も長く、最も声部数の多い(3声)フィナーレとして設計。フィナーレ実測ピーク振幅0.7469(クリッピングなし)を確認済み |
| `ui_select.wav` | P10-4-4 (2026-08-22) | 正弦波の単音(1200Hz)、130ms。既存13音がすべて矩形波/三角波/ノイズのみで構成されるのに対し、ui_selectだけが正弦波を使うことで汎用UI音として明確に区別される |

## 第三者配布素材(DOVA-SYNDROME)

以下の4曲は**このリポジトリの管理者による自作ではなく**、DOVA-SYNDROME(https://dova-s.jp/)で配布されている第三者の楽曲をダウンロードして`public/sounds/`へ組み込んだものである。音源自体を素材として再配布する目的ではなく、本ゲームのBGMとして組み込んで使用している。利用条件はDOVA-SYNDROMEの利用規約および各作者の個別条件に従う(コード上でDOVA-SYNDROMEへ直接アクセスしたり、DOVAのURLからストリーミング再生したりすることはなく、常にローカルに同梱した`/sounds/bgm_title.mp3`・`/sounds/bgm_gameplay.mp3`・`/sounds/bgm_destination.mp3`・`/sounds/bgm_gameover.mp3`を再生する)。

| ファイル | 導入 | Original title | Composer | Source | Source page | Usage | sample rate | channels | bitrate | duration |
|---|---|---|---|---|---|---|---|---|---|---|
| `bgm_title.mp3` | P11-2 (2026-08-23) | おさかなシャトルⅡ | Hupple | DOVA-SYNDROME | https://dova-s.jp/bgm/detail/23317 | title BGM | 48000Hz | 2 (stereo) | 320kbps (CBR) | 62.400s |
| `bgm_gameplay.mp3` | P11-2 (2026-08-23) | 夏を終わらせない！ | しんさんわーくす | DOVA-SYNDROME | https://dova-s.jp/bgm/detail/23761 | normal gameplay BGM | 48000Hz | 2 (stereo) | 160kbps (CBR) | 192.048s |
| `bgm_destination.mp3` | P11-4-1 (2026-08-25) | 始まりを告げる喇叭 | Kyo_Punch | DOVA-SYNDROME | https://dova-s.jp/bgm/detail/448 | destinationCelebration BGM | 44100Hz | 2 (stereo) | 192kbps (CBR) | 8.046s |
| `bgm_gameover.mp3` | P11-4-2 (2026-08-25) | どうぶつ大運動会(ループ版/Track2) | MAKOOTO | DOVA-SYNDROME | https://dova-s.jp/bgm/detail/9821 | gameOver BGM | 44100Hz | 2 (stereo) | 192kbps (CBR) | 74.742s |

License/terms: DOVA-SYNDROMEの利用規約および作者個別条件に従う。

## 第三者配布素材(PeriTune)

以下の1曲は**このリポジトリの管理者による自作ではなく**、作曲者PeriTune(https://peritune.com/)が自身のサイトで配布している楽曲をダウンロードして`public/sounds/`へ組み込んだものである(DOVA-SYNDROME経由ではない)。音源自体を素材として再配布する目的ではなく、本ゲームのBGMとして組み込んで使用している(コード上でPeriTuneへ直接アクセスしたり、PeriTuneのURLからストリーミング再生したりすることはなく、常にローカルに同梱した`/sounds/bgm_settlement.mp3`を再生する)。

利用規約(https://peritune.com/about/)によると、2026年3月以降に公開された楽曲にはサイト独自の規約が適用されるが、それ以前に公開された楽曲には引き続きCreative Commons Attribution 4.0 International (CC BY 4.0)が適用される。採用した`Result_Celtic`の配布ページ(https://peritune.com/result_celtic/)には公開日として「2021-03-18」の記載があり、2026年3月より前の公開のためCC BY 4.0が適用される。同規約によれば、クレジット表記(「PeriTune」)は推奨されるが必須ではなく、映像・動画・イベント・広告・ゲーム・ライブ配信など媒体を問わず商用利用も可能。ただし、YouTubeのContent ID登録、楽曲ファイルそのものの売却・二次配布、楽曲紹介を目的とした動画での利用(フル再生やメドレー形式)は禁止されている。

| ファイル | 導入 | Original title | Composer | Source | Source page | Published | License | Usage | sample rate | channels | bitrate | duration |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `bgm_settlement.mp3` | P11-4-1 (2026-08-25) | Result_Celtic(リザルトジングル&ループBGM ケルト) | PeriTune | PeriTune | https://peritune.com/result_celtic/ | 2021-03-18 | CC BY 4.0 | settlement BGM | 48000Hz | 2 (stereo) | 192kbps (CBR) | 92.448s |

License/terms: https://peritune.com/about/ に記載のCC BY 4.0(2026年3月より前に公開された楽曲に適用される条件)に従う。

## 旧ファイルの削除記録

| ファイル | 経緯 |
|---|---|
| `monopoly_group.mp3` | 2026-08-13追加時点で入手元・ライセンスの記録が一切残っておらず、リポジトリ内(コミットメッセージ・README・ファイルメタデータ)のいずれからも確認できなかった(P10-4調査時点)。Phase10/P10-4-3で`monopoly_group.wav`(自作・手続き的生成)へ正式に置き換え、コード上の参照が完全になくなったことを確認したうえで**削除済み**。 |
| `bgm_title.wav` / `bgm_gameplay.wav` | P11-2で`scripts/generate-bgm.mjs`により自作・手続き的生成したBGM(コミット前の未コミット段階)。試聴の結果、方針をDOVA-SYNDROME配布の第三者楽曲(上記`bgm_title.mp3`/`bgm_gameplay.mp3`)へ変更したため正式に不採用とし、生成スクリプト`scripts/generate-bgm.mjs`・専用テスト`scripts/generate-bgm.test.ts`とあわせて**削除済み**(いずれも未コミットのままの差し替えのため、コミット履歴には残らない)。 |

すべてのSE(14種)がP10-4-1〜P10-4-4の手続き的生成で揃ったため、CC0素材での補完は不要になった。BGM(title/gameplay)はP11-2でDOVA-SYNDROME配布の第三者楽曲を採用し、P11-4-1でdestinationCelebration(DOVA-SYNDROME配布)・settlement(PeriTune配布)の2曲を、P11-4-2でgameOver(DOVA-SYNDROME配布)を追加し、5シーン全てのBGMが揃った。
