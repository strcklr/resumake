<script lang="ts">
  // Keeping your resumes in your own private GitHub repo. Step 1 works today: it opens GitHub's
  // "use this template" page for strcklr/resumes-template.
  // Steps 2 and 3 arrive with GitHub sign-in (issue #5).
  const TEMPLATE_REPO = 'https://github.com/strcklr/resumes-template';
  const USE_TEMPLATE = 'https://github.com/new?template_name=resumes-template&template_owner=strcklr';
</script>

<section class="github">
  <h2>Keep your resumes in your own private GitHub repo</h2>
  <p>
    Your resumes live in a private repo you own. Its GitHub Actions workflow builds the PDF and Word file on every
    change, and keeps every version you've sent as a release. Nothing about your resume is stored on this site.
  </p>

  <ol class="steps">
    <li>
      <h3>Create your resumes repo</h3>
      <p>
        Makes a copy of the <a href={TEMPLATE_REPO} target="_blank" rel="noopener noreferrer">resumes template</a>: a
        sample resume, a tailored example and the build workflow.
      </p>
      <a class="button-link" href={USE_TEMPLATE} target="_blank" rel="noopener noreferrer">
        Create my resumes repo <span aria-hidden="true">↗</span>
      </a>
      <p class="fine">
        On GitHub's page, name it (for example <code>resumes</code>) and choose <strong>Private</strong>: new repos
        are public by default.
      </p>
    </li>
    <li>
      <h3>Put your resumes in it</h3>
      <p>
        Use <strong>Download all</strong> above, unzip, and add the files to the repo's <code>resumes/</code> folder
        (on GitHub: <strong>Add file → Upload files</strong>). To edit them again later, download the repo and use
        <strong>Open folder</strong> on its <code>resumes/</code> folder.
      </p>
    </li>
    <li class="soon-step">
      <h3>Connect GitHub <span class="soon">Coming soon</span></h3>
      <p>
        Sign in to open and save the repo's files straight from here, with no downloading: each save goes to a branch
        or pull request, and the repo's workflow builds the PDF. The resumake GitHub App will ask for access to that
        one repo only.
      </p>
    </li>
  </ol>
</section>
