let psg = "";
let psgName = "";
let allLinks;
let linksText = [];
let started = false;
let p5Origin = "";
let firstPassageSent = false;

function preserveWhitespaceInNode(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    for (const node of textNodes) {
        const text = node.nodeValue;
        if (text == null || text === "") continue;
        const lines = text.split("\n");
        const frag = document.createDocumentFragment();
        for (let i = 0; i < lines.length; i++) {
            frag.appendChild(document.createTextNode(lines[i]));
            if (i < lines.length - 1) {
                frag.appendChild(document.createElement("br"));
            }
        }
        node.parentNode.replaceChild(frag, node);
    }
}

window.onload = () =>{
    $(document).on(':passageend', function (ev) {
        
        /* Log details about the current moment. */
        psgName = ev.passage.name;
        // console.group('Details about the current moment');
        console.log('buffer:', ev.detail);

        // console.groupEnd();
        
        const content = ev.detail.content.cloneNode(true);
        preserveWhitespaceInNode(content);
        psg = content.innerHTML;
        console.log(psg);
        allLinks = document.querySelectorAll('a.link-internal');
        // console.log("links: ",allLinks);
        linksText = [];
        
        allLinks.forEach(function(node) {
            linksText.push(node.innerHTML);
        }
        );

        // console.log("linksText: ",linksText);
        let psgInfo = {psgName: psgName, passage: psg, links: linksText};

        if (!started){
            console.log("SugarCube is ready!");
            parent.postMessage({ type: "init", info: psgInfo}, window.location.origin);
            started = true;
        }
        else
            console.log("Sending passage back!");
            parent.postMessage({ type: "passage", info: psgInfo}, window.location.origin);
    });


    // $(document).one(':passageend', function (ev) {
    //     // console.log('passagŹ name:', ev.detail);
    //     console.log("SugarCube is ready!");


    //     /* Log details about the current moment. */
    //     psgName = ev.passage.name;
    //     // console.group('Details about the current moment');
    //     // console.log('buffer:', ev.detail);

    //     // console.groupEnd();
        
    //     psg = ev.detail.content.outerText;
    //     allLinks = document.querySelectorAll('a.link-internal');
    //     // console.log("links: ",allLinks);
    //     linksText = [];
        
    //     allLinks.forEach(function(node) {
    //         linksText.push(node.innerHTML);
    //     }
    //     );

    //     // console.log("linksText: ",linksText);
    //     let psgInfo = {psgName: psgName, passage: psg, links: linksText};


    //     parent.postMessage({ type: "init", info: psgInfo}, window.location.origin);
    //     // parent.postMessage({ type: "init"}, window.location.origin);

    //     // psgName = ev.passage.name;
    //     // psg = ev.detail.content.outerText;
    //     // window.postMessage({ type: "passage", psgName: psgName, passage: psg, links: linksText}, window.location.origin);
        
    // });

    window.addEventListener("message", function (event) {
        const { type, passage, clicked } = event.data;
        
        if (event.data.type === "ping") {
            event.source.postMessage({ type: "pong", status: "ready" }, event.origin);
            p5Origin = event.origin;
        }

        if (event.data.type === "start") {
            started = true;
            SugarCube.Engine.restart();
            
        }
        if (event.data.type === "play") {
            SugarCube.Engine.play(passage);
            console.log(SugarCube.State.variables);
        }
        if (event.data.type === "click"){
            console.log(allLinks[clicked]);
            allLinks[clicked].click();
        }

    });
}
