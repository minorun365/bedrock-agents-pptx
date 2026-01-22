# エージェント作成

- pptx-agent
- Claude Sonnet 4.5
- ユーザーからの依頼をもとに、Web検索やナレッジベースから情報収集を行い、PowerPointでスライド資料を作成してください。作成した資料のURLは、メールでユーザーへ送付してください。なお現在は2026年です。

## アクショングループ関数

- search-web: query
- create-pptx: title, content
  - 説明: content引数には、空行で区切って複数スライドを指定してください。各ブロックの1行目がスライドタイトル、2行目以降が本文です。箇条書きは各スライド4点以内に収めてください。行頭記号は自動付与されるため、記号を含めないこと。
- send-email: url

## レイヤー作成

```sh
# Pythonをバージョンアップ
sudo dnf install python3.12 python3.12-pip -y

# 新規フォルダにpython-pptxをインストール
mkdir python
pip3.12 install python-pptx -t python

# パッケージをZIPに圧縮
zip -r layer.zip python
```

# 開発環境の作成

- SageMaker AI
  - ドメインを作成
  - クイックセットアップ ※2分ほど待機
- ドメインの詳細 > アプリケーション設定
  - Code Editor > 編集
    - アイドルシャットダウンを有効にする
    - 時間： 60
- IAMコンソールを開く
  - `AmazonSageMaker-ExecutionRole` を検索
  - 「最後のアクティビティ」が最新のものをクリック
  - 「アクセス許可を追加 > ポリシーをアタッチ」
    - `AmazonBedrockFullAccess` を追加
- SageMaker Studio
  - Code Editor
  - Create Code Editor space
    - Name: pptx-agent > Create space
    - Instance: ml.t3.large > Run space
  - 30秒待機 > Open
- コードエディタ
  - 左ペイン「Explorer > Open Folder」
  - `/home/sagemaker-user/` のままOK
  - 「Do you trust...」ダイアログが出たら承認
  - 右上 `日` アイコンでターミナルを表示
- 隠しフォルダを非表示にする（下記コマンド後、ブラウザをリロード）

```sh
cat << 'EOF' > ~/sagemaker-code-editor-server-data/data/User/settings.json
{
  "files.exclude": {
    "**/.*": true,
    "**/sagemaker-*": true,
    "**/user-default-*": true
  }
}
EOF
```


# フロントエンド開発

- テンプレからリポジトリ作成
  - https://docs.amplify.aws/react/start/quickstart/
  - 名前は `pptx-agent`
- コードエディタで上記をクローン

```sh
git config --global user.name "<GitHubユーザー名>"
git config --global user.email "<GitHub登録メルアド>"
git clone <リポジトリURL.git>
```

- 以下ファイルを更新
  - amplify/backend.ts
  - src/main.tsx
  - src/index.css
  - src/App.tsx
  - src/App.css
- パッケージを追加

```sh
# プロジェクトディレクトリに移動
cd pptx-agent

# 必要なパッケージをインストール
npm install

# 必要なパッケージを追加
npm install @aws-sdk/client-bedrock-agent-runtime
npm install tsx --save-dev
```

- 左ペイン「Source Control」からコミットしてプッシュ


# Amplifyにデプロイ

- マネコンでAmplifyを開く
- 新しいアプリを作成
- GitHub > 次へ
- GItHubアクセス許可を実施し、前述のリポジトリとmainブランチを選択して次へ
- 詳細設定に環境変数を追加
  - VITE_AGENT_ID
  - VITE_AGENT_ALIAS_ID
- 次へ > 保存してデプロイ
- 5分待機


# 動作確認

- 「デプロイされたURLにアクセス」
- アカウントを作る