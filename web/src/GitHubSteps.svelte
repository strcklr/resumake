<script lang="ts">
  // Placeholders for the GitHub half of the plan. Nothing here talks to GitHub yet: the template
  // repo, the GitHub App and the sign-in Worker don't exist. Until they do, step 1 points at the
  // manual setup that works today (copying template/ from this repo).
  const REPO = 'https://github.com/strcklr/resumake';
  const TEMPLATE_DIR = `${REPO}/tree/main/template`;
  const NEW_REPO = 'https://github.com/new';
</script>

<section class="card">
  <h2>Keep it in your own private GitHub repo</h2>
  <p>
    Your resume lives in a private repo you own. Its GitHub Actions workflow builds the PDF and Word file on
    every change, so nothing about your resume is stored on this site.
  </p>

  <ol class="steps">
    <li>
      <h3>Create your resumes repo</h3>
      <p>
        Soon: one button that copies a ready-made template repo. For now, set it up by hand:
      </p>
      <ol class="manual">
        <li><a href={NEW_REPO} target="_blank" rel="noopener noreferrer">Create a new repository</a> and set it to <strong>Private</strong>.</li>
        <li>Copy the files in resumake's <a href={TEMPLATE_DIR} target="_blank" rel="noopener noreferrer"><code>template/</code> folder</a> into it, including <code>.github/</code>.</li>
        <li>Use <strong>Download YAML</strong> above and commit the file as <code>resumes/default.yml</code>.</li>
      </ol>
      <button type="button" disabled title="Coming soon: needs the resumes-template repo">
        Create from template
      </button>
    </li>
    <li>
      <h3>Connect GitHub</h3>
      <p>
        Install the resumake GitHub App on <em>only</em> your resumes repo. It asks for two permissions, contents
        and pull requests, and can't see your other repos. Then open any file in the repo here, including
        <code>tailored/</code> variants that use <code>extends:</code>.
      </p>
      <button type="button" disabled title="Coming soon: needs the GitHub App and sign-in Worker">
        Connect GitHub
      </button>
    </li>
    <li>
      <h3>Save changes</h3>
      <p>
        Commit to a new branch (with a pull request) or straight to <code>main</code>. Your repo's workflow builds
        the PDF and attaches it to the run; merges to <code>main</code> publish a release.
      </p>
      <button type="button" disabled title="Coming soon: available after you connect GitHub">Save to GitHub</button>
    </li>
  </ol>
</section>
