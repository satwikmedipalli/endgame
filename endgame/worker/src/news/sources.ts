// Free RSS feeds, checked working on 2026-10-23. Reuters and AP have no usable public RSS.
// `region` decides feed order (US, then India, then world); `hint` nudges the category.
export type Region = 'US' | 'IN' | 'World';
export type Source = { name: string; url: string; region: Region; hint?: string };

export const SOURCES: Source[] = [
  { name: 'NPR', url: 'https://feeds.npr.org/1001/rss.xml', region: 'US' },
  { name: 'BBC', url: 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml', region: 'US' },
  { name: 'The New York Times', url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', region: 'US' },
  { name: 'Politico', url: 'https://rss.politico.com/politics-news.xml', region: 'US', hint: 'Politics' },
  { name: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', region: 'US', hint: 'Business' },
  { name: 'ESPN', url: 'https://www.espn.com/espn/rss/news', region: 'US', hint: 'Sports' },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', region: 'US', hint: 'Tech' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', region: 'US', hint: 'Tech' },
  { name: 'Google News', url: 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en', region: 'US' },

  { name: 'The Hindu', url: 'https://www.thehindu.com/news/national/feeder/default.rss', region: 'IN' },
  { name: 'The Indian Express', url: 'https://indianexpress.com/section/india/feed/', region: 'IN' },
  { name: 'Mint', url: 'https://www.livemint.com/rss/news', region: 'IN', hint: 'Business' },
  { name: 'NDTV', url: 'https://feeds.feedburner.com/ndtvnews-top-stories', region: 'IN' },
  { name: 'The Times of India', url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms', region: 'IN' },
  { name: 'ESPNcricinfo', url: 'https://www.espncricinfo.com/rss/content/story/feeds/0.xml', region: 'IN', hint: 'Cricket' },
  { name: 'Google News', url: 'https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en', region: 'IN' },

  { name: 'BBC', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', region: 'World' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', region: 'World' },
  { name: 'The Guardian', url: 'https://www.theguardian.com/world/rss', region: 'World' },
  { name: 'DW', url: 'https://rss.dw.com/rdf/rss-en-all', region: 'World' },
  { name: 'BBC', url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', region: 'World', hint: 'Science' },
  { name: 'BBC', url: 'https://feeds.bbci.co.uk/news/health/rss.xml', region: 'World', hint: 'Health' },
];

/** How many stories each region gets, in feed order. */
export const QUOTA: Record<Region, number> = { US: 13, IN: 13, World: 12 };
