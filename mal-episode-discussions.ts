function init() {
    $ui.register((ctx) => {
        let mounting = false;
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
        ctx.dom.observe('[data-vc-element="control-bar-main-section"]', async (bars) => {
            if (mounting) return;
            mounting = true;
            try {
                for (const bar of bars) {
                    if (await bar.queryOne('[data-mal-discussion-button]')) continue;
                    const host = await ctx.dom.queryOne('[data-vc-element="container"]');
                    if (!host) continue;
                    const panel = await ctx.dom.createElement('aside');
                    panel.setAttribute('data-mal-discussion-panel', 'true');
                    panel.setCssText('position:absolute;right:12px;top:52px;bottom:84px;width:420px;max-width:calc(100% - 24px);z-index:100;background:#111;color:#eee;border:1px solid #444;border-radius:6px;display:none;flex-direction:column;font-size:14px;pointer-events:auto;');
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
                                const text = String(p.body || '').replace(/\[spoiler(?:=[^\]]*)?\][\s\S]*?\[\/spoiler\]/gi, '[Spoiler hidden]').replace(/\[\/?[^\]]+\]/g, '');
                                return '<article style="border-bottom:1px solid #333;padding:12px 0;overflow-wrap:anywhere"><strong>' + escape(p.created_by && p.created_by.name) + '</strong><small style="display:block;color:#999">' + escape(p.created_at) + '</small><div style="white-space:pre-wrap">' + escape(text) + '</div></article>';
                            }).join('') + (!posts.length ? '<p>No comments on this page.</p>' : ''));
                        } catch (e) { if (version === revision) body.setText(String(e)); }
                    }
                    await button(header, '\u21bb', 'Refresh discussion', load);
                    const settings = await ctx.dom.createElement('div'); settings.setCssText('display:none;padding:12px;border-bottom:1px solid #333;');
                    const input = await ctx.dom.createElement('input'); input.setAttribute('type', 'password'); input.setAttribute('placeholder', 'MAL Client ID'); input.setAttribute('aria-label', 'MAL Client ID'); input.setProperty('value', $storage.get('mal.clientId') || ''); input.setCssText(controlCss + 'width:100%;box-sizing:border-box;'); settings.append(input);
                    await button(settings, 'Save', 'Save Client ID locally', async () => { $storage.set('mal.clientId', String(await input.getProperty('value') || '').trim()); settings.setStyle('display', 'none'); await load(); });
                    await button(header, '\u2699', 'Settings', () => settings.setStyle('display', 'block'));
                    await button(header, '\u00d7', 'Close discussions', () => panel.setStyle('display', 'none'));
                    panel.append(settings); panel.append(body);
                    const footer = await ctx.dom.createElement('div'); footer.setCssText('display:flex;gap:8px;padding:10px;border-top:1px solid #333;'); panel.append(footer);
                    await button(footer, 'Previous', 'Previous 50 comments', () => { offset = Math.max(0, offset - 50); return load(); });
                    await button(footer, 'Next', 'Next 50 comments', () => { offset += 50; return load(); });
                    const toggle = await button(bar, 'MAL', 'MyAnimeList episode discussions', async () => {
                        const media: any = ctx.videoCore.getCurrentMedia();
                        malId = Number(media && media.idMal) || 0;
                        const info: any = ctx.videoCore.getCurrentPlaybackInfo();
                        episode = Number(info && info.episode && info.episode.episodeNumber) || 1;
                        const count = Math.max(episode, Number(media && media.episodes) || 1);
                        episodes.setInnerHTML(Array.from({ length: count }, (_, i) => '<option value="' + (i + 1) + '">Episode ' + (i + 1) + '</option>').join(''));
                        episodes.setProperty('value', String(episode)); topicId = 0; offset = 0;
                        panel.setStyle('display', 'flex');
                        if (!$storage.get('mal.clientId')) settings.setStyle('display', 'block');
                        await load();
                    });
                    toggle.setAttribute('data-mal-discussion-button', 'true');
                    toggle.setCssText('background:transparent;border:0;color:white;padding:0 10px;height:100%;cursor:pointer;font-size:14px;');
                    episodes.addEventListener('change', async () => { episode = Number(await episodes.getProperty('value')); offset = 0; topicId = 0; await load(); });
                }
            } finally { mounting = false; }
        });
    });
}
