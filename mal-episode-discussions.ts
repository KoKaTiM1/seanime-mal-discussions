function init() {
    $ui.register((ctx) => {
        let mounting = false;
        let pageMedia: any = null;
        const tray = ctx.newTray({ iconUrl: 'https://cdn.myanimelist.net/images/favicon.ico', withContent: true, width: '950px' });
        tray.render(() => tray.div([], { className: 'mal-discussions-host', style: { height: '720px', maxHeight: '80vh', position: 'relative', overflow: 'hidden', boxSizing: 'border-box' } }));
        ctx.screen.onNavigate(async (e) => {
            const id = Number(e.searchParams && e.searchParams.id);
            pageMedia = null;
            if (e.pathname !== '/entry' || !id) return;
            try {
                const response = await ctx.fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'query($id:Int){Media(id:$id,type:ANIME){id idMal episodes status nextAiringEpisode{episode} title{userPreferred}}}', variables: { id } }) });
                pageMedia = response.json().data.Media;
            } catch (e) { console.error('MAL media lookup:', e); }
        });
        ctx.screen.loadCurrent();
        const cache: Record<string, any> = {};
        const escape = (s: any) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        function renderComment(raw: string) {
            let text = String(raw || '').replace(/<blockquote\b[^>]*>/gi, '[quote]').replace(/<\/blockquote>/gi, '[/quote]').replace(/<br\s*\/?\s*>/gi, '\n').replace(/\[spoiler(?:=[^\]]*)?\][\s\S]*?\[\/spoiler\]/gi, '[Spoiler hidden]');
            text = text.replace(/<img\b[^>]*src=["'](https?:\/\/[^"']+)["'][^>]*>/gi, '[img]$1[/img]').replace(/<[^>]*>/g, '');
            text = text.replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => { const c = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n); return c > 0 && c <= 0x10ffff ? String.fromCodePoint(c) : ''; }).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
            let html = escape(text);
            const image = (url: string) => '<img loading="lazy" referrerpolicy="no-referrer" src="' + url + '" alt="Comment image" style="display:block;max-width:100%;max-height:600px;object-fit:contain;height:auto;margin:10px 0">';
            const embeds: string[] = [];
            const storeImage = (url: string) => { const key = '\u0001' + embeds.length + '\u0002'; embeds.push(image(url)); return key; };
            html = html.replace(/\[img(?:=[^\]]*)?\](https?:\/\/[^\s<>]+?)\[\/img\]/gi, (_, url) => storeImage(url));
            html = html.replace(/https?:\/\/[^\s<>\[\]]+?\.(?:jpg|jpeg|png|gif|webp)(?:\?[^\s<>\[\]]*)?/gi, url => storeImage(url));
            html = html.replace(/\[quote(?:=([^\]]*))?\]/gi, (_, author) => '<blockquote style="margin:8px 0;padding:10px 14px;border-left:3px solid #777;background:#202020;border-radius:4px">' + (author ? '<strong style="font-size:14px;display:block">' + author + '</strong>' : '')).replace(/\[\/quote\]/gi, '</blockquote>');
            html = html.replace(/\[b\]/gi, '<strong>').replace(/\[\/b\]/gi, '</strong>').replace(/\[i\]/gi, '<em>').replace(/\[\/i\]/gi, '</em>').replace(/\[\/?[^\]]+\]/g, '');
            return html.replace(/\n{3,}/g, '\n\n').replace(/\u0001(\d+)\u0002/g, (_, index) => embeds[Number(index)]);
        }
        const controlCss = 'background:#222;color:#eee;border:1px solid #444;border-radius:4px;padding:7px;font:inherit;';
        async function request(path: string) {
            const clientId = String($getUserPreference('clientId') || '').trim();
            if (!clientId) throw new Error('Enter your MAL Client ID in settings.');
            const key = clientId + path;
            if (cache[key] && Date.now() - cache[key].at < 60000) return cache[key].data;
            const response = await ctx.fetch('https://api.myanimelist.net/v2' + path, { headers: { 'X-MAL-CLIENT-ID': clientId } });
            if (!response.ok) throw new Error('MyAnimeList returned HTTP ' + response.status + '. Check your Client ID or try again later.');
            const data = response.json();
            cache[key] = { at: Date.now(), data: data };
            return data;
        }
        ctx.dom.observe('.mal-discussions-host', async (bars) => {
            if (mounting) return;
            mounting = true;
            try {
                for (const bar of bars) {
                    if (await bar.queryOne('[data-mal-discussion-button]')) continue;
                    const host = bar;
                    if (!host) continue;
                    // Seanime wraps tray content in its own 35rem scroll area.
                    let ancestor = await host.getParent();
                    for (let depth = 0; ancestor && depth < 6; depth++) {
                        const classes = await ancestor.getAttribute('class') || '';
                        if (classes.includes('overflow-y-auto') && classes.includes('35rem')) {
                            ancestor.setStyle('overflow', 'hidden');
                            ancestor.setStyle('max-height', 'none');
                            ancestor.setStyle('padding', '0');
                            break;
                        }
                        ancestor = await ancestor.getParent();
                    }
                    const panel = await ctx.dom.createElement('aside');
                    panel.setAttribute('data-mal-discussion-panel', 'true');
                    panel.setCssText('position:absolute;inset:0;background:#090909;color:#ccc;display:flex;flex-direction:column;font-size:17px;pointer-events:auto;overflow:hidden;box-sizing:border-box;');
                    host.append(panel);
                    const header = await ctx.dom.createElement('div');
                    header.setCssText('display:flex;align-items:center;gap:8px;padding:12px;border-bottom:1px solid #333;flex-wrap:wrap;flex-shrink:0;');
                    panel.append(header);
                    async function button(parent: any, label: string, title: string, fn: () => any) {
                        const el = await ctx.dom.createElement('button');
                        el.setText(label); el.setAttribute('title', title); el.setAttribute('type', 'button');
                        el.setCssText(controlCss + 'cursor:pointer;'); el.addEventListener('click', fn); parent.append(el); return el;
                    }
                    const title = await ctx.dom.createElement('strong'); title.setText('MAL Discussions'); header.append(title);
                    const episodes = await ctx.dom.createElement('select'); episodes.setCssText(controlCss); episodes.setAttribute('aria-label', 'Discussion episode'); header.append(episodes);
                    const body = await ctx.dom.createElement('div'); body.setCssText('flex:1;min-height:0;overflow:auto;padding:14px;line-height:1.6;white-space:normal;');
                    let episode = 1, malId = 0, offset = 0, topicId = 0, revision = 0, busy = false, hasNext = false;
                    let previous: any, next: any, pageLabel: any;
                    function updatePaging() {
                        if (!previous) return;
                        previous.setProperty('disabled', busy || offset === 0);
                        next.setProperty('disabled', busy || !hasNext);
                        previous.setStyle('opacity', busy || offset === 0 ? '0.4' : '1');
                        next.setStyle('opacity', busy || !hasNext ? '0.4' : '1');
                        pageLabel.setText('Page ' + (Math.floor(offset / 50) + 1));
                    }
                    async function load() {
                        const version = ++revision;
                        busy = true; hasNext = false; updatePaging();
                        body.setText('Loading episode ' + episode + ' discussion...');
                        try {
                            if (!malId) throw new Error('This anime has no MyAnimeList ID.');
                            if (!topicId) {
                                const anime = await request('/anime/' + malId + '?fields=alternative_titles');
                                if (version !== revision) return;
                                const result = await request('/forum/topics?q=' + encodeURIComponent(anime.title + ' Episode ' + episode) + '&limit=100');
                                if (version !== revision) return;
                                const pattern = new RegExp('\\bEpisode\\s+0*' + episode + '\\b', 'i');
                                const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
                                const names = [anime.title, anime.alternative_titles && anime.alternative_titles.en].filter(Boolean).map(normalize);
                                const topics = (result.data || []).filter((t: any) => {
                                    const title = String(t.title || '');
                                    const series = normalize(title.split(/\bEpisode\s+\d+/i)[0].replace(/\[spoilers?\]/gi, ''));
                                    return pattern.test(title) && /discussion/i.test(title) && names.indexOf(series) !== -1;
                                });
                                if (!topics.length) throw new Error('No discussion thread found for episode ' + episode + '.');
                                topicId = topics[0].id;
                            }
                            const result = await request('/forum/topic/' + topicId + '?limit=50&offset=' + offset);
                            if (version !== revision) return;
                            const posts = (result.data && result.data.posts) || [];
                            hasNext = !!(result.paging && result.paging.next);
                            body.setInnerHTML('<h3 style="font-size:16px;margin:0 0 12px">' + escape(result.data && result.data.title) + '</h3>' + posts.map((p: any) => {
                                return '<article style="background:#121212;border-radius:6px;padding:16px;margin:12px 0;overflow-wrap:anywhere"><strong style="font-size:14px;color:#eee">' + escape(p.created_by && p.created_by.name) + '</strong><small style="margin-left:12px;color:#999">' + escape(new Date(p.created_at).toLocaleDateString()) + '</small><div style="white-space:pre-wrap;margin-top:10px">' + renderComment(p.body) + '</div></article>';
                                /* Legacy renderer retained below pending cleanup.
                                let text = String(p.body || '');
                                const images: string[] = [];
                                text = text.replace(/\[img(?:=[^\]]*)?\](https?:\/\/[^\s<>]+?)\[\/img\]/gi, (_, url) => { images.push(url); return ''; });
                                text = text.replace(/<img\b[^>]*src=["'](https?:\/\/[^"']+)["'][^>]*>/gi, (_, url) => { images.push(url); return ''; });
                                text = text.replace(/<[^>]*>/g, '').replace(/\[\/?[^\]]+\]/g, '').replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => { const code = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n); return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''; }).replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
                                return '<article style="background:#121212;border-radius:6px;padding:16px;margin:12px 0;overflow-wrap:anywhere"><strong style="font-size:14px;color:#eee">' + escape(p.created_by && p.created_by.name) + '</strong><small style="margin-left:12px;color:#999">' + escape(new Date(p.created_at).toLocaleDateString()) + '</small><div style="white-space:pre-wrap;margin-top:10px">' + escape(text).replace(/\n{3,}/g, '\n\n') + '</div>' + images.map(url => '<img loading="lazy" referrerpolicy="no-referrer" src="' + escape(url) + '" style="max-width:100%;height:auto;margin-top:8px">').join('') + '</article>';
                                */
                            }).join('') + (!posts.length ? '<p>No comments on this page.</p>' : ''));
                            body.setProperty('scrollTop', 0);
                        } catch (e) { if (version === revision) body.setText(String(e)); }
                        finally { if (version === revision) { busy = false; updatePaging(); } }
                    }
                    await button(header, '\u21bb', 'Refresh discussion', load);
                    await button(header, '\u00d7', 'Close discussions', () => tray.close());
                    panel.append(body);
                    const footer = await ctx.dom.createElement('div'); footer.setCssText('display:flex;align-items:center;justify-content:center;gap:16px;padding:10px;border-top:1px solid #333;flex-shrink:0;background:#090909;'); panel.append(footer);
                    previous = await button(footer, 'Previous', 'Previous 50 comments', () => { if (busy || offset === 0) return; offset = Math.max(0, offset - 50); return load(); });
                    pageLabel = await ctx.dom.createElement('span'); footer.append(pageLabel);
                    next = await button(footer, 'Next', 'Next 50 comments', () => { if (busy || !hasNext) return; offset += 50; return load(); });
                    updatePaging();
                    const openDiscussion = async () => {
                        const media: any = pageMedia;
                        if (!media) { ++revision; episodes.setInnerHTML(''); body.setText('No anime page found. Open an anime page to view its discussions.'); return; }
                        malId = Number(media && media.idMal) || 0;
                        title.setText(media.title.userPreferred + ' - MAL Discussions');
                        episode = 1;
                        const count = media.nextAiringEpisode ? Math.max(0, media.nextAiringEpisode.episode - 1) : media.status === 'NOT_YET_RELEASED' ? 0 : Number(media.episodes) || 0;
                        if (!count) { episodes.setInnerHTML(''); body.setText('No aired episodes found.'); return; }
                        episodes.setInnerHTML(Array.from({ length: count }, (_, i) => '<option value="' + (i + 1) + '">Episode ' + (i + 1) + '</option>').join(''));
                        episodes.setProperty('value', String(episode)); topicId = 0; offset = 0;
                        panel.setStyle('display', 'flex');
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
