function init() {
    $ui.register((ctx) => {
        let mounting = false;
        let pageMedia: any = null;
        const tray = ctx.newTray({ iconUrl: 'https://cdn.myanimelist.net/images/favicon.ico', withContent: true, width: '650px' });
        tray.htm(() => '<div data-mal-tray-host style="height:80vh;position:relative"></div>');
        ctx.screen.onNavigate(async (e) => {
            const id = Number(e.searchParams && e.searchParams.id);
            if (e.pathname !== '/entry' || !id) return;
            try {
                const response = await ctx.fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'query($id:Int){Media(id:$id,type:ANIME){id idMal episodes title{userPreferred}}}', variables: { id } }) });
                pageMedia = response.json().data.Media;
            } catch (e) { console.error('MAL media lookup:', e); }
        });
        ctx.screen.loadCurrent();
        const cache: Record<string, any> = {};
        const escape = (s: any) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const controlCss = 'background:#222;color:#eee;border:1px solid #444;border-radius:4px;padding:7px;font:inherit;';
        async function request(path: string) {
            const clientId = String($storage.get('mal.clientId') || '').trim();
            if (!clientId) throw new Error('Enter your MAL Client ID in settings.');
            const key = clientId + path;
            if (cache[key] && Date.now() - cache[key].at < 60000) return cache[key].data;
            const response = await ctx.fetch('https://api.myanimelist.net/v2' + path, { headers: { 'X-MAL-CLIENT-ID': clientId } });
            if (!response.ok) throw new Error('MyAnimeList returned HTTP ' + response.status + '. Check your Client ID or try again later.');
            const data = response.json();
            cache[key] = { at: Date.now(), data: data };
            return data;
        }
        ctx.dom.observe('[data-mal-tray-host]', async (bars) => {
            if (mounting) return;
            mounting = true;
            try {
                for (const bar of bars) {
                    if (await bar.queryOne('[data-mal-discussion-button]')) continue;
                    const host = bar;
                    if (!host) continue;
                    const panel = await ctx.dom.createElement('aside');
                    panel.setAttribute('data-mal-discussion-panel', 'true');
                    panel.setCssText('position:absolute;inset:0;background:#111;color:#eee;display:flex;flex-direction:column;font-size:14px;pointer-events:auto;');
                    host.append(panel);
                    const header = await ctx.dom.createElement('div');
                    header.setCssText('display:flex;align-items:center;gap:8px;padding:12px;border-bottom:1px solid #333;flex-wrap:wrap;');
                    panel.append(header);
                    async function button(parent: any, label: string, title: string, fn: () => any) {
                        const el = await ctx.dom.createElement('button');
                        el.setText(label); el.setAttribute('title', title); el.setAttribute('type', 'button');
                        el.setCssText(controlCss + 'cursor:pointer;'); el.addEventListener('click', fn); parent.append(el); return el;
                    }
                    const title = await ctx.dom.createElement('strong'); title.setText('MAL Discussions'); header.append(title);
                    const episodes = await ctx.dom.createElement('select'); episodes.setCssText(controlCss); episodes.setAttribute('aria-label', 'Discussion episode'); header.append(episodes);
                    const body = await ctx.dom.createElement('div'); body.setCssText('flex:1;min-height:0;overflow:auto;padding:14px;line-height:1.6;white-space:normal;');
                    let episode = 1, malId = 0, offset = 0, topicId = 0, revision = 0;
                    async function load() {
                        const version = ++revision;
                        body.setText('Loading episode ' + episode + ' discussion...');
                        try {
                            if (!malId) throw new Error('This anime has no MyAnimeList ID.');
                            if (!topicId) {
                                const result = await request('/forum/topics?anime_id=' + malId + '&q=' + encodeURIComponent('Episode ' + episode) + '&limit=100');
                                const pattern = new RegExp('\\bEpisode\\s+0*' + episode + '\\b', 'i');
                                const topics = (result.data || []).filter((t: any) => pattern.test(t.title || '') && /discussion/i.test(t.title || ''));
                                if (!topics.length) throw new Error('No discussion thread found for episode ' + episode + '.');
                                topicId = topics[0].id;
                            }
                            const result = await request('/forum/topic/' + topicId + '?limit=50&offset=' + offset);
                            if (version !== revision) return;
                            const posts = (result.data && result.data.posts) || [];
                            body.setInnerHTML('<h3 style="font-size:16px;margin:0 0 12px">' + escape(result.data && result.data.title) + '</h3>' + posts.map((p: any) => {
                                let text = String(p.body || '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/\[spoiler(?:=[^\]]*)?\][\s\S]*?\[\/spoiler\]/gi, '[Spoiler hidden]');
                                const images: string[] = [];
                                text = text.replace(/\[img(?:=[^\]]*)?\](https?:\/\/[^\s<>]+?)\[\/img\]/gi, (_, url) => { images.push(url); return ''; });
                                text = text.replace(/<img\b[^>]*src=["'](https?:\/\/[^"']+)["'][^>]*>/gi, (_, url) => { images.push(url); return ''; });
                                text = text.replace(/<[^>]*>/g, '').replace(/\[\/?[^\]]+\]/g, '');
                                return '<article style="border-bottom:1px solid #333;padding:12px 0;overflow-wrap:anywhere"><strong>' + escape(p.created_by && p.created_by.name) + '</strong><small style="display:block;color:#999">' + escape(p.created_at) + '</small><div style="white-space:pre-wrap">' + escape(text) + '</div>' + images.map(url => '<img loading="lazy" referrerpolicy="no-referrer" src="' + escape(url) + '" style="max-width:100%;height:auto;margin-top:8px">').join('') + '</article>';
                            }).join('') + (!posts.length ? '<p>No comments on this page.</p>' : ''));
                        } catch (e) { if (version === revision) body.setText(String(e)); }
                    }
                    await button(header, '\u21bb', 'Refresh discussion', load);
                    const settings = await ctx.dom.createElement('div'); settings.setCssText('display:none;padding:12px;border-bottom:1px solid #333;');
                    const input = await ctx.dom.createElement('input'); input.setAttribute('type', 'password'); input.setAttribute('placeholder', 'MAL Client ID'); input.setAttribute('aria-label', 'MAL Client ID'); input.setProperty('value', $storage.get('mal.clientId') || ''); input.setCssText(controlCss + 'width:100%;box-sizing:border-box;'); settings.append(input);
                    await button(settings, 'Save', 'Save Client ID locally', async () => { $storage.set('mal.clientId', String(await input.getProperty('value') || '').trim()); settings.setStyle('display', 'none'); await load(); });
                    await button(header, '\u2699', 'Settings', () => settings.setStyle('display', 'block'));
                    await button(header, '\u00d7', 'Close discussions', () => tray.close());
                    panel.append(settings); panel.append(body);
                    const footer = await ctx.dom.createElement('div'); footer.setCssText('display:flex;gap:8px;padding:10px;border-top:1px solid #333;'); panel.append(footer);
                    await button(footer, 'Previous', 'Previous 50 comments', () => { offset = Math.max(0, offset - 50); return load(); });
                    await button(footer, 'Next', 'Next 50 comments', () => { offset += 50; return load(); });
                    const openDiscussion = async () => {
                        const media: any = pageMedia || ctx.videoCore.getCurrentMedia();
                        malId = Number(media && media.idMal) || 0;
                        const info: any = ctx.videoCore.getCurrentPlaybackInfo();
                        episode = Number(info && info.episode && info.episode.episodeNumber) || 1;
                        const count = Math.max(episode, Number(media && media.episodes) || 1);
                        episodes.setInnerHTML(Array.from({ length: count }, (_, i) => '<option value="' + (i + 1) + '">Episode ' + (i + 1) + '</option>').join(''));
                        episodes.setProperty('value', String(episode)); topicId = 0; offset = 0;
                        panel.setStyle('display', 'flex');
                        if (!$storage.get('mal.clientId')) settings.setStyle('display', 'block');
                        await load();
                    };
                    const toggle = await button(header, 'Load', 'Load selected anime discussions', openDiscussion);
                    toggle.setAttribute('data-mal-discussion-button', 'true');
                    toggle.setCssText('background:transparent;border:0;color:white;padding:0 10px;height:100%;cursor:pointer;font-size:14px;');
                    episodes.addEventListener('change', async () => { episode = Number(await episodes.getProperty('value')); offset = 0; topicId = 0; await load(); });
                    await openDiscussion();
                }
            } finally { mounting = false; }
        });
    });
}
