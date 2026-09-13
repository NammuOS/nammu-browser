export interface NewTabLinkSeed {
  id: string;
  title: string;
  url: string;
  note: string;
}

export interface NewTabBoardSeed {
  id: string;
  title: string;
  links: NewTabLinkSeed[];
}

export interface NewTabWorkspaceSeed {
  id: string;
  name: string;
  boards: NewTabBoardSeed[];
}

const link = (id: string, title: string, url: string, note: string): NewTabLinkSeed => ({
  id,
  title,
  url,
  note,
});

export const DEFAULT_NEW_TAB_WORKSPACES: NewTabWorkspaceSeed[] = [
  {
    id: 'focus',
    name: 'Focus',
    boards: [
      {
        id: 'daily',
        title: 'Daily systems',
        links: [
          link('gmail', 'Gmail', 'https://mail.google.com/', 'Mail and communication'),
          link('calendar', 'Google Calendar', 'https://calendar.google.com/', 'Schedule and focus'),
          link('drive', 'Google Drive', 'https://drive.google.com/', 'Documents and files'),
          link('notion', 'Notion', 'https://www.notion.so/', 'Notes and knowledge'),
        ],
      },
      {
        id: 'knowledge',
        title: 'Knowledge',
        links: [
          link('wikipedia', 'Wikipedia', 'https://www.wikipedia.org/', 'Reference encyclopedia'),
          link(
            'archive',
            'Internet Archive',
            'https://archive.org/',
            'Books, media and web history',
          ),
          link(
            'wolfram',
            'WolframAlpha',
            'https://www.wolframalpha.com/',
            'Computational knowledge',
          ),
          link('scholar', 'Google Scholar', 'https://scholar.google.com/', 'Academic discovery'),
        ],
      },
      {
        id: 'communication',
        title: 'Communication',
        links: [
          link('whatsapp', 'WhatsApp', 'https://web.whatsapp.com/', 'Messages'),
          link('telegram', 'Telegram', 'https://web.telegram.org/', 'Channels and messages'),
          link('discord', 'Discord', 'https://discord.com/app', 'Communities'),
          link('slack', 'Slack', 'https://app.slack.com/', 'Team communication'),
        ],
      },
    ],
  },
  {
    id: 'studio',
    name: 'Studio',
    boards: [
      {
        id: 'engineering',
        title: 'Engineering',
        links: [
          link('github', 'GitHub', 'https://github.com/', 'Source and collaboration'),
          link(
            'stackoverflow',
            'Stack Overflow',
            'https://stackoverflow.com/',
            'Technical answers',
          ),
          link('mdn', 'MDN Web Docs', 'https://developer.mozilla.org/', 'Web platform reference'),
          link('npm', 'npm', 'https://www.npmjs.com/', 'JavaScript packages'),
        ],
      },
      {
        id: 'design',
        title: 'Design',
        links: [
          link('figma', 'Figma', 'https://www.figma.com/', 'Interface design'),
          link('dribbble', 'Dribbble', 'https://dribbble.com/', 'Visual inspiration'),
          link('behance', 'Behance', 'https://www.behance.net/', 'Creative portfolios'),
          link('coolors', 'Coolors', 'https://coolors.co/', 'Color systems'),
        ],
      },
      {
        id: 'ai',
        title: 'AI workspace',
        links: [
          link('chatgpt', 'ChatGPT', 'https://chatgpt.com/', 'General reasoning'),
          link('claude', 'Claude', 'https://claude.ai/', 'Analysis and writing'),
          link('huggingface', 'Hugging Face', 'https://huggingface.co/', 'Models and datasets'),
          link('aistudio', 'Google AI Studio', 'https://aistudio.google.com/', 'Model prototyping'),
        ],
      },
    ],
  },
  {
    id: 'intelligence',
    name: 'Intelligence',
    boards: [
      {
        id: 'research',
        title: 'Research',
        links: [
          link('arxiv', 'arXiv', 'https://arxiv.org/', 'Open research papers'),
          link(
            'semantic',
            'Semantic Scholar',
            'https://www.semanticscholar.org/',
            'Research discovery',
          ),
          link(
            'paperscode',
            'Papers with Code',
            'https://paperswithcode.com/',
            'Research implementations',
          ),
          link(
            'scholar-research',
            'Google Scholar',
            'https://scholar.google.com/',
            'Academic search',
          ),
        ],
      },
      {
        id: 'security',
        title: 'Security intelligence',
        links: [
          link(
            'virustotal',
            'VirusTotal',
            'https://www.virustotal.com/',
            'File and URL intelligence',
          ),
          link('shodan', 'Shodan', 'https://www.shodan.io/', 'Internet asset search'),
          link('hibp', 'Have I Been Pwned', 'https://haveibeenpwned.com/', 'Breach awareness'),
          link('owasp', 'OWASP', 'https://owasp.org/', 'Application security'),
        ],
      },
      {
        id: 'signals',
        title: 'Industry signals',
        links: [
          link(
            'hackernews',
            'Hacker News',
            'https://news.ycombinator.com/',
            'Technology discussion',
          ),
          link('producthunt', 'Product Hunt', 'https://www.producthunt.com/', 'New products'),
          link(
            'github-trending',
            'GitHub Trending',
            'https://github.com/trending',
            'Trending projects',
          ),
          link('lobsters', 'Lobsters', 'https://lobste.rs/', 'Computing community'),
        ],
      },
    ],
  },
  {
    id: 'operations',
    name: 'Operations',
    boards: [
      {
        id: 'shipping',
        title: 'Ship',
        links: [
          link('vercel', 'Vercel', 'https://vercel.com/dashboard', 'Deployments'),
          link('cloudflare', 'Cloudflare', 'https://dash.cloudflare.com/', 'Network and edge'),
          link('supabase', 'Supabase', 'https://supabase.com/dashboard', 'Data and backend'),
          link('actions', 'GitHub Actions', 'https://github.com/features/actions', 'Automation'),
        ],
      },
      {
        id: 'observability',
        title: 'Observe',
        links: [
          link('sentry', 'Sentry', 'https://sentry.io/', 'Application monitoring'),
          link('betterstack', 'Better Stack', 'https://betterstack.com/', 'Uptime and logs'),
          link(
            'grafana',
            'Grafana Cloud',
            'https://grafana.com/products/cloud/',
            'Metrics and traces',
          ),
          link('pagespeed', 'PageSpeed Insights', 'https://pagespeed.web.dev/', 'Web performance'),
        ],
      },
      {
        id: 'product',
        title: 'Product systems',
        links: [
          link('linear', 'Linear', 'https://linear.app/', 'Product execution'),
          link('notion-product', 'Notion', 'https://www.notion.so/', 'Documentation'),
          link('trello', 'Trello', 'https://trello.com/', 'Visual planning'),
          link('canva', 'Canva', 'https://www.canva.com/', 'Product graphics'),
        ],
      },
    ],
  },
  {
    id: 'engineering-lab',
    name: 'Engineering Lab',
    boards: [
      {
        id: 'source-platforms',
        title: 'Source platforms',
        links: [
          link('gitlab', 'GitLab', 'https://gitlab.com/', 'DevSecOps platform'),
          link('bitbucket', 'Bitbucket', 'https://bitbucket.org/', 'Git collaboration'),
          link('codeberg', 'Codeberg', 'https://codeberg.org/', 'Community Git hosting'),
          link('sourcegraph', 'Sourcegraph', 'https://sourcegraph.com/', 'Code intelligence'),
          link('grep-app', 'grep.app', 'https://grep.app/', 'Search public code'),
        ],
      },
      {
        id: 'api-lab',
        title: 'API laboratory',
        links: [
          link('postman', 'Postman', 'https://www.postman.com/', 'API development'),
          link('hoppscotch', 'Hoppscotch', 'https://hoppscotch.io/', 'Open API client'),
          link('insomnia', 'Insomnia', 'https://insomnia.rest/', 'API design and testing'),
          link('swagger', 'Swagger Editor', 'https://editor.swagger.io/', 'OpenAPI authoring'),
          link('httpbin', 'httpbin', 'https://httpbin.org/', 'HTTP request diagnostics'),
        ],
      },
      {
        id: 'containers-infra',
        title: 'Infrastructure',
        links: [
          link('docker', 'Docker Hub', 'https://hub.docker.com/', 'Container registry'),
          link(
            'kubernetes',
            'Kubernetes Docs',
            'https://kubernetes.io/docs/',
            'Container orchestration',
          ),
          link(
            'terraform',
            'Terraform Registry',
            'https://registry.terraform.io/',
            'Infrastructure modules',
          ),
          link('ansible', 'Ansible Galaxy', 'https://galaxy.ansible.com/', 'Automation content'),
          link(
            'cloudflare-docs',
            'Cloudflare Docs',
            'https://developers.cloudflare.com/',
            'Edge platform reference',
          ),
        ],
      },
      {
        id: 'package-registries',
        title: 'Packages & runtimes',
        links: [
          link('crates', 'crates.io', 'https://crates.io/', 'Rust packages'),
          link('pypi', 'PyPI', 'https://pypi.org/', 'Python packages'),
          link('maven', 'Maven Central', 'https://central.sonatype.com/', 'JVM packages'),
          link('nuget', 'NuGet', 'https://www.nuget.org/', '.NET packages'),
          link('endoflife', 'endoflife.date', 'https://endoflife.date/', 'Runtime support cycles'),
        ],
      },
    ],
  },
  {
    id: 'creative-suite',
    name: 'Creative Suite',
    boards: [
      {
        id: 'visual-design',
        title: 'Visual design',
        links: [
          link('photopea', 'Photopea', 'https://www.photopea.com/', 'Browser image editor'),
          link('penpot', 'Penpot', 'https://design.penpot.app/', 'Open design platform'),
          link(
            'adobe-express',
            'Adobe Express',
            'https://new.express.adobe.com/',
            'Creative production',
          ),
          link('pixlr', 'Pixlr', 'https://pixlr.com/', 'Image editing'),
          link('excalidraw', 'Excalidraw', 'https://excalidraw.com/', 'Visual sketching'),
        ],
      },
      {
        id: 'media-production',
        title: 'Media production',
        links: [
          link(
            'youtube-studio',
            'YouTube Studio',
            'https://studio.youtube.com/',
            'Channel production',
          ),
          link('descript', 'Descript', 'https://web.descript.com/', 'Audio and video editing'),
          link(
            'kapwing',
            'Kapwing',
            'https://www.kapwing.com/studio/editor',
            'Collaborative video editing',
          ),
          link('veed', 'VEED', 'https://www.veed.io/', 'Video production'),
          link('suno', 'Suno', 'https://suno.com/', 'Music creation'),
        ],
      },
      {
        id: 'assets',
        title: 'Creative assets',
        links: [
          link('unsplash', 'Unsplash', 'https://unsplash.com/', 'Photography'),
          link('pexels', 'Pexels', 'https://www.pexels.com/', 'Stock photos and video'),
          link('fonts', 'Google Fonts', 'https://fonts.google.com/', 'Typography library'),
          link('icons', 'Lucide', 'https://lucide.dev/icons/', 'Open icon library'),
          link('svgrepo', 'SVG Repo', 'https://www.svgrepo.com/', 'SVG assets'),
        ],
      },
      {
        id: 'inspiration',
        title: 'Inspiration',
        links: [
          link('awwwards', 'Awwwards', 'https://www.awwwards.com/', 'Digital design showcase'),
          link('siteinspire', 'SiteInspire', 'https://www.siteinspire.com/', 'Website inspiration'),
          link('landbook', 'Land-book', 'https://land-book.com/', 'Landing page gallery'),
          link('mobbin', 'Mobbin', 'https://mobbin.com/', 'Product interface patterns'),
          link('pinterest', 'Pinterest', 'https://www.pinterest.com/', 'Visual discovery'),
        ],
      },
    ],
  },
  {
    id: 'learning',
    name: 'Learning',
    boards: [
      {
        id: 'courses',
        title: 'Courses',
        links: [
          link('coursera', 'Coursera', 'https://www.coursera.org/', 'Structured courses'),
          link('edx', 'edX', 'https://www.edx.org/', 'University learning'),
          link('khan', 'Khan Academy', 'https://www.khanacademy.org/', 'Foundational learning'),
          link('mit-ocw', 'MIT OpenCourseWare', 'https://ocw.mit.edu/', 'Open university courses'),
          link('cs50', 'CS50', 'https://cs50.harvard.edu/', 'Computer science courses'),
        ],
      },
      {
        id: 'coding-practice',
        title: 'Practice',
        links: [
          link(
            'freecodecamp',
            'freeCodeCamp',
            'https://www.freecodecamp.org/',
            'Project-based coding',
          ),
          link('leetcode', 'LeetCode', 'https://leetcode.com/', 'Programming problems'),
          link('exercism', 'Exercism', 'https://exercism.org/', 'Language practice'),
          link('codewars', 'Codewars', 'https://www.codewars.com/', 'Coding challenges'),
          link(
            'frontendmentor',
            'Frontend Mentor',
            'https://www.frontendmentor.io/',
            'Frontend projects',
          ),
        ],
      },
      {
        id: 'roadmaps',
        title: 'Roadmaps & books',
        links: [
          link('roadmap', 'roadmap.sh', 'https://roadmap.sh/', 'Technology roadmaps'),
          link('devdocs', 'DevDocs', 'https://devdocs.io/', 'Unified API documentation'),
          link(
            'javascript-info',
            'JavaScript.info',
            'https://javascript.info/',
            'JavaScript reference',
          ),
          link(
            'rust-book',
            'The Rust Book',
            'https://doc.rust-lang.org/book/',
            'Rust language guide',
          ),
          link('go-dev', 'Go Documentation', 'https://go.dev/doc/', 'Go language resources'),
        ],
      },
      {
        id: 'languages',
        title: 'Languages',
        links: [
          link('duolingo', 'Duolingo', 'https://www.duolingo.com/', 'Language practice'),
          link('deepl', 'DeepL', 'https://www.deepl.com/translator', 'Translation and writing'),
          link(
            'translate',
            'Google Translate',
            'https://translate.google.com/',
            'Language translation',
          ),
          link('youglish', 'YouGlish', 'https://youglish.com/', 'Pronunciation in context'),
          link('wiktionary', 'Wiktionary', 'https://www.wiktionary.org/', 'Open dictionary'),
        ],
      },
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    boards: [
      {
        id: 'analytics',
        title: 'Analytics',
        links: [
          link(
            'analytics',
            'Google Analytics',
            'https://analytics.google.com/',
            'Audience analytics',
          ),
          link(
            'search-console',
            'Search Console',
            'https://search.google.com/search-console/',
            'Search performance',
          ),
          link('plausible', 'Plausible', 'https://plausible.io/', 'Privacy-first analytics'),
          link('mixpanel', 'Mixpanel', 'https://mixpanel.com/', 'Product analytics'),
          link(
            'clarity',
            'Microsoft Clarity',
            'https://clarity.microsoft.com/',
            'Behavior analytics',
          ),
        ],
      },
      {
        id: 'discovery',
        title: 'Search & discovery',
        links: [
          link('trends', 'Google Trends', 'https://trends.google.com/', 'Search trends'),
          link('ahrefs', 'Ahrefs', 'https://ahrefs.com/', 'Search intelligence'),
          link('semrush', 'Semrush', 'https://www.semrush.com/', 'Marketing intelligence'),
          link('similarweb', 'Similarweb', 'https://www.similarweb.com/', 'Digital market signals'),
          link(
            'answer-public',
            'AnswerThePublic',
            'https://answerthepublic.com/',
            'Audience questions',
          ),
        ],
      },
      {
        id: 'publishing',
        title: 'Publishing',
        links: [
          link('medium', 'Medium', 'https://medium.com/', 'Long-form publishing'),
          link('substack', 'Substack', 'https://substack.com/', 'Newsletter publishing'),
          link('wordpress', 'WordPress', 'https://wordpress.com/', 'Web publishing'),
          link('hashnode', 'Hashnode', 'https://hashnode.com/', 'Developer publishing'),
          link('devto', 'DEV Community', 'https://dev.to/', 'Technical community'),
        ],
      },
      {
        id: 'social',
        title: 'Audience',
        links: [
          link('linkedin', 'LinkedIn', 'https://www.linkedin.com/', 'Professional network'),
          link('x', 'X', 'https://x.com/', 'Public conversation'),
          link('reddit-growth', 'Reddit', 'https://www.reddit.com/', 'Communities'),
          link('buffer', 'Buffer', 'https://publish.buffer.com/', 'Social publishing'),
          link('mailchimp', 'Mailchimp', 'https://mailchimp.com/', 'Email campaigns'),
        ],
      },
    ],
  },
  {
    id: 'business',
    name: 'Business',
    boards: [
      {
        id: 'planning',
        title: 'Planning',
        links: [
          link('asana', 'Asana', 'https://app.asana.com/', 'Team projects'),
          link('clickup', 'ClickUp', 'https://app.clickup.com/', 'Work management'),
          link('monday', 'Monday', 'https://monday.com/', 'Team operations'),
          link('airtable', 'Airtable', 'https://airtable.com/', 'Structured workflows'),
          link('miro', 'Miro', 'https://miro.com/app/dashboard/', 'Collaborative whiteboards'),
        ],
      },
      {
        id: 'meetings',
        title: 'Meetings',
        links: [
          link('meet', 'Google Meet', 'https://meet.google.com/', 'Video meetings'),
          link('zoom', 'Zoom', 'https://app.zoom.us/wc/', 'Video conferencing'),
          link('teams', 'Microsoft Teams', 'https://teams.microsoft.com/', 'Team collaboration'),
          link('calendly', 'Calendly', 'https://calendly.com/', 'Meeting scheduling'),
          link('whereby', 'Whereby', 'https://whereby.com/', 'Browser meetings'),
        ],
      },
      {
        id: 'commerce',
        title: 'Commerce',
        links: [
          link('stripe', 'Stripe Dashboard', 'https://dashboard.stripe.com/', 'Payments'),
          link('paypal', 'PayPal', 'https://www.paypal.com/', 'Payments and transfers'),
          link('shopify', 'Shopify', 'https://admin.shopify.com/', 'Commerce operations'),
          link('gumroad', 'Gumroad', 'https://app.gumroad.com/', 'Digital products'),
          link('wise', 'Wise', 'https://wise.com/', 'International finance'),
        ],
      },
      {
        id: 'documents',
        title: 'Documents',
        links: [
          link('docs', 'Google Docs', 'https://docs.google.com/', 'Collaborative documents'),
          link('sheets', 'Google Sheets', 'https://sheets.google.com/', 'Spreadsheets'),
          link('office', 'Microsoft 365', 'https://www.microsoft365.com/', 'Office workspace'),
          link('docusign', 'DocuSign', 'https://app.docusign.com/', 'Electronic agreements'),
          link('dropbox-sign', 'Dropbox Sign', 'https://app.hellosign.com/', 'Document signing'),
        ],
      },
    ],
  },
];
