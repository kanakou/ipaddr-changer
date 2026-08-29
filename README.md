# IP Address Converter (ipaddr-changer)

⚡ **IP Address Converter** は、IPv4 / IPv6 アドレス、NAT64 プレフィックス、IPv4写像アドレス、および逆引き DNS (PTR) レコードを相互に変換・解析できる高精度 Web ツール & JavaScript ライブラリです。

---

## 🌟 主な機能

### 1. 🔄 NAT64 & IPv4写像アドレス相互変換
- **NAT64 (RFC 6052 /96 Well-Known Prefix `64:ff9b::/96`) 相互変換**:
  - IPv4 アドレス（例: `192.0.2.1`）から NAT64 アドレス（例: `64:ff9b::c000:201`）へ変換
  - NAT64 アドレスから IPv4 アドレスへの抽出・復元
  - 16進表記・ドット併記表記（`64:ff9b::192.0.2.1`）の両方に対応
- **IPv4写像アドレス (IPv4-Mapped IPv6 `::ffff:0:0/96`) 相互変換**:
  - IPv4 と `::ffff:x.x.x.x` の双方向変換

### 2. 🌐 逆引き DNS (PTR レコード / ゾーン名) 相互変換
- **ホスト & CIDR サブネットプレフィックス両対応**:
  - **IPv4 (in-addr.arpa)**:
    - ホスト (`192.168.1.1`) ↔ `1.1.168.192.in-addr.arpa`
    - `/24` ゾーン (`192.168.1.0/24`) ↔ `1.168.192.in-addr.arpa.`
    - `/16` ゾーン (`172.16.0.0/16`) ↔ `16.172.in-addr.arpa.`
    - `/8` ゾーン (`10.0.0.0/8`) ↔ `10.in-addr.arpa.`
    - 非オクテット境界 (`192.168.1.0/25`) ↔ RFC 2317 形式（`0/25.1.168.192.in-addr.arpa.`）
  - **IPv6 (ip6.arpa)**:
    - ホスト (`2001:db8::1`) ↔ `1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa`
    - ニブル境界ゾーン (`2001:db8::/32`) ↔ `8.b.d.0.1.0.0.2.ip6.arpa.` (8ニブル)
    - ニブル境界ゾーン (`2001:db8:1234:5600::/56`) ↔ `6.5.4.3.2.1.8.b.d.0.1.0.0.2.ip6.arpa.` (14ニブル)
    - 省略記法（`::`）を含むあらゆる有効な IPv6 アドレスに対応
    - ゾーン名（例: `8.b.d.0.1.0.0.2.ip6.arpa`）から CIDR ネットワーク（`2001:db8::/32`）への逆引き復元に対応
    - 非ニブル境界（`/58` など）における親ゾーン案内および警告表示

### 3. 🔍 IP 詳細アナライザー & IPv6 圧縮/展開
- **詳細情報の解析**:
  - アドレス種別 / スコープ判定（グローバル、プライベート、ループバック、リンクローカル、マルチキャスト、NAT64、ULAなど）
  - 10進数（Integer）、16進数（Hex）、2進数（Binary）表記
  - RFC 5952 推奨の最短圧縮形式と完全展開（32文字16進）形式

### 4. 🎨 洗練された UI / UX
- **リアルタイム変換**: 入力と同時に瞬時に変換結果を表示
- **ワンクリックコピー**: 出力結果をクリップボードに素早くコピー
- **サンプル入力ボタン**: ワンクリックでテスト用 IP アドレスを入力
- **ダークモード対応**: システム外観設定に応じた自動ダークテーマ

---

## 📁 ディレクトリ構成

```
ipaddr-changer/
├── css/
│   └── style.css            # デザインシステム & スタイルシート
├── icons/                   # PWA 用アプリアイコン (SVG, PNG)
├── js/
│   ├── ip-utils.js          # コア変換ロジック (ブラウザ・Node.js 共通)
│   └── app.js               # index.html 用コントローラー
├── test/
│   └── ip-utils.test.js     # 単体テスト (node:test)
├── index.html               # 統合 Web アプリケーション
├── manifest.json            # PWA マニフェスト設定
├── sw.js                    # Service Worker (オフライン完全対応キャッシュ)
└── README.md                # ドキュメント
```

---

## 🚀 使い方

### Web ブラウザで利用する場合
ローカルまたは静的 Web サーバー（GitHub Pages 等）に配置し、`index.html` をブラウザで開くだけで動作します。外部ライブラリ依存はありません。

```bash
# 例: Python の簡易 HTTP サーバーで起動
python3 -m http.server 8000
# http://localhost:8000 をブラウザで開く
```

### Node.js ライブラリとして利用する場合
`js/ip-utils.js` は UMD モジュールとして作成されているため、Node.js 環境でも直接 `require` して利用可能です。

```javascript
const IPUtils = require('./js/ip-utils.js');

// IPv4 -> NAT64
const nat64 = IPUtils.convertV4ToNat64('192.0.2.1');
console.log(nat64.standard); // '64:ff9b::c000:201'

// IPv6 -> 逆引き DNS (ip6.arpa)
const ptr = IPUtils.ipToReverseDNS('2001:db8::1');
console.log(ptr.record);
// '1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa'

// 逆引き DNS -> IPv6
const ip = IPUtils.reverseDNSToIP('1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa');
console.log(ip.ip); // '2001:db8::1'
```

---

## 🧪 テストの実行

Node.js 標準のテストランナーを使用して単体テストを実行できます。

```bash
node --test test/ip-utils.test.js
```

---

## 📜 準拠 RFC / 仕様
- [RFC 4291](https://datatracker.ietf.org/doc/html/rfc4291) - IP Version 6 Addressing Architecture
- [RFC 5952](https://datatracker.ietf.org/doc/html/rfc5952) - A Recommendation for IPv6 Text Representation
- [RFC 6052](https://datatracker.ietf.org/doc/html/rfc6052) - IPv6 Addressing of IPv4/IPv6 Translators (NAT64)
- [RFC 1035](https://datatracker.ietf.org/doc/html/rfc1035) - Domain Names - Implementation and Specification (in-addr.arpa / ip6.arpa)
- [RFC 1918](https://datatracker.ietf.org/doc/html/rfc1918) - Address Allocation for Private Internets
