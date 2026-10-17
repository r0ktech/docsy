import { ProsePage } from '@/components/marketing/prose-page';

export const metadata = { title: 'Privacy policy' };

export default function PrivacyPage() {
  return (
    <ProsePage title="Privacy policy" updated="October 16, 2026">
      <p>
        This policy describes how this Docsy deployment handles your information. If you run your own deployment,
        review it and adapt it to your providers and jurisdiction before going live.
      </p>
      <h2>What we store</h2>
      <ul>
        <li>Your account details: name, email address, and a password hash (Argon2id) or a link to your Google account.</li>
        <li>The files you upload, the text extracted from them, and search indexes (passages and their embeddings).</li>
        <li>Your conversations, including questions, answers and the citations attached to them.</li>
        <li>Usage counts (documents, storage, questions, and AI token usage) used to enforce plan limits.</li>
        <li>Session records, including the browser user agent and IP address at sign-in, so you can see and end sessions.</li>
      </ul>
      <h2>How documents are processed</h2>
      <p>
        Files are kept in private object storage and are only served to the account that uploaded them. To make a
        document searchable, its text is split into passages and each passage is sent to the configured embedding
        provider to create a search vector. When you ask a question, the question and a small number of matching
        passages are sent to the configured language-model provider to write the answer. Whole documents are not
        sent for chat.
      </p>
      <h2>Third-party providers</h2>
      <p>
        Depending on configuration, this service uses an AI provider (for example Anthropic, OpenAI or Voyage AI), an
        object storage provider, a database host, and optionally an email provider for password resets. Their own
        terms and data policies apply to the data they process.
      </p>
      <h2>Cookies</h2>
      <p>
        Docsy uses one essential, HTTP-only session cookie to keep you signed in, short-lived cookies during Google
        sign-in, and local storage for interface preferences such as the theme. There are no advertising or analytics
        cookies.
      </p>
      <h2>Deleting your data</h2>
      <p>
        You can delete documents, collections and conversations at any time. Deleting your account from Settings
        removes your account and all associated documents, files, indexes, conversations and usage records.
      </p>
      <h2>Contact</h2>
      <p>For privacy questions, use the details on the <a href="/contact">contact page</a>.</p>
    </ProsePage>
  );
}
